var config = require('./config');
var express = require('express');
var url = require('url');
var Uber = require('node-uber');
var unirest = require('unirest');
var gender = require('gender');
var request = require('request');

var app = express();
var uber = new Uber({
  client_id: config.uber.client_id,
  client_secret: config.uber.client_secret,
  server_token: config.uber.server_token,
  redirect_uri: config.uber.redirect_uri,
  name: config.express.app_name,
  sandbox: config.uber.sandbox
});

app.listen(config.express.port, function() {
  console.log(config.express.app_name + ' listening on port ' + config.express.port + ' ...');
});

// diable view engine for static content delivery
app.set("view options", {
  layout: false
});
// get statis pages from web folder
app.use(express.static(__dirname + '/web'));

// show Take Me Home Now! app
app.get('/', function(req, res) {
  res.render('index.html');
});

// login with uber credentials
app.get('/api/login', function(request, response) {
  var url = uber.getAuthorizeUrl(config.uber.scopes);
  response.redirect(url);
});

// process callback and redirect with access_token
app.get('/api/callback', function(request, response) {
  uber.authorization({
      authorization_code: request.query.code
    },
    function(err, access_token, refresh_token) {
      if (err) {
        console.error(err);
        return;
      }
      response.redirect('/index.html?access_token=' + access_token);
    });
});

app.get('/api/payment-methods', function(request, response) {
  getPaymentMethods(response);
});

// get all uber products for location
app.get('/api/products', function(request, response) {
  var query = url.parse(request.url, true).query;

  // if no query params sent, respond with Bad Request
  if (!query || !query.lat || !query.lng) {
    response.sendStatus(400);
  } else {
    getUberProducts(query.lat, query.lng, response);
  }
});

// create a new ride request to home place
app.get('/api/requests/new/home', function(request, response) {
  var query = url.parse(request.url, true).query;

  // if no query params sent, respond with Bad Request
  if (!query || !query.lat || !query.lng || !query.product_id) {
    response.sendStatus(400);
  } else {
    createNewRequestHome(query.lat, query.lng, query.product_id, response);
  }
});

// get uber user profile
app.get('/api/user/profile', function(request, response) {
  var query = url.parse(request.url, true).query;

  getUberProfile(query.access_token, response);
});

// get current request status
app.get('/api/requests/current', function(request, response) {
  getCurrentRequest(response);
});

// get complete estimate for price and arrival time for home place
app.get('/api/estimate/home', function(request, response) {
  var query = url.parse(request.url, true).query;

  // if no query params sent, respond with Bad Request
  if (!query || !query.lat || !query.lng) {
    response.sendStatus(400);
  } else {
    getCompleteHomeEstimate(query.lat, query.lng, response);
  }
});

function getCompleteHomeEstimate(lat, lng, response) {
  // get home address from profile
  uber.places.getHome(function(err, res) {
    if (err) {
      console.error(err);
      return;
    }

    var homeAddress = res.address;
    // use the GMaps API to get lat and lng coordinates for location
    var geoCodeURL = 'http://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(homeAddress) + '&sensor=false';

    request({
      method: 'GET',
      uri: geoCodeURL,
    }, function(err2, res2) {
      if (err2) {
        console.error(err2);
        return;
      }

      var jsonResult = JSON.parse(res2.body);

      // estimate price to get home
      uber.estimates.getPriceForRoute(lat, lng, jsonResult.results[0].geometry.location.lat,
        jsonResult.results[0].geometry.location.lng, function(err3, res3) {
        if (err3) {
          console.error(err3);
          return;
        }

        // to get a complete trip time, add time estimate for driver to arrive
        uber.estimates.getETAForLocation(lat, lng, function(err4, res4) {
          if (err4) {
            console.error(err4);
            return;
          }

          // add to existing time estimates
          res3.prices.forEach(function(price) {
            res4.times.forEach(function(time) {
              if (price.product_id === time.product_id) {
                price.duration += time.estimate;
              }
            });
          });

          response.send(res3);
        });
      });
    });
  });
}

function getCurrentRequest(response) {
  uber.requests.getCurrent(
    function(err, res) {
      if (err) {
        console.error(err);
        return;
      }

      // if ride is accepted, check for gender
      if (res.status === 'accepted') {
        // randomize driver data first
        identifyGenderAndRespond(res, response);
      } else {
        response.send(res);
      }
    });
}

function getPaymentMethods(response) {
  uber.payment.methods(
    function(err, res) {
      if (err) {
        console.error(err);
        return;
      }

      response.send(res);
    });
}

function createNewRequestHome(lat, lon, product_id, response) {
  uber.requests.create({
    start_latitude: lat,
    start_longitude: lon,
    product_id: product_id,
    end_place_id: 'home'
  }, function(err, res) {
    if (err) {
      console.error(err);
      response.sendStatus(500);
    } else {
      response.send(res);

      // accept the ride automatically after 3 secs
      setTimeout(function() {
        acceptRequest(res.request_id);
      }, 3000);
    }
  });
}

function acceptRequest(request_id) {
  console.log('Accepting request ' + request_id + ' now ...');
  /*
  uber.requests.updateCurrent({
    status: 'accepted',
    request_id: request_id
  }, function(err, res) {
    if (err) {
      console.error(err);
      return;
    }
  });
  */
}

function getUberProducts(lat, lon, response) {
  uber.products.getAllForLocation(lat, lon, function(err, res) {
    if (err) {
      console.error(err);
      return;
    }

    response.send(res);
  });
}

function getUberProfile(access_token, response) {
  if (!access_token || access_token === '') {
    // ensure user is authorized
    response.sendStatus(401);
  } else {
    uber.user.getProfile(access_token, function(err, res) {
      if (err) {
        console.log(err);
        return;
      }

      if (res.picture && res.picture !== '') {
        identifyGenderAndRespond(res, response);
      } else {
        // just in case there is no image
        response.sendStatus(400);
      }
    });
  }
}

function identifyGenderAndRespond(res, response) {
  var pictureUrl, firstName, genderGuess, imageGuess, outputGender, outputConfidence;

  // set pictureUrl and firstName depending on response type
  if (res.driver) {
    pictureUrl = res.driver.picture_url;
    firstName = res.driver.name;
  } else {
    pictureUrl = res.picture;
    firstName = res.first_name;
  }

  // analyze the profile picture
  unirest.get('https://faceplusplus-faceplusplus.p.mashape.com/detection/detect?attribute=gender&url=' + pictureUrl)
    .header('X-Mashape-Key', config.mashape.key)
    .header('Accept', 'application/json')
    .end(function(result) {
      // analyze the profile name
      genderGuess = gender.guess(firstName);
      genderGuessConfidence = genderGuess.confidence * 100;


      if (result.body.face.length > 0) {
        imageGuess = result.body.face[0].attribute.gender.value.toLowerCase();
        imageGuessConfidence = result.body.face[0].attribute.gender.confidence;

        // if name has a useful result, combine
        if (genderGuess.gender !== 'unknown' && genderGuessConfidence && genderGuessConfidence > 50) {
          if (genderGuess.gender === imageGuess) {
            // picture and name hint to same gender
            outputGender = imageGuess;
            // combined confidence
            outputConfidence = (imageGuessConfidence + genderGuessConfidence) / 2;
          } else {
            // if picture and name have conflicting gender, take the one that is more confident
            if (genderGuess.confidence >= imageGuessConfidence) {
              outputGender = genderGuess.gender;
              outputConfidence = genderGuess.confidence;
            } else {
              outputGender = imageGuess;
              outputConfidence = imageGuessConfidence;
            }

          }
        }
      } else {
        // take the genderguess as fallback
        outputGender = genderGuess.gender;
        outputConfidence = genderGuess.confidence;
      }


      // append new gender attributes to response
      if (res.driver) {
        res.driver.gender = outputGender;
        res.driver.gender_confidence = outputConfidence;
      } else {
        res.gender = outputGender;
        res.gender_confidence = outputConfidence;
      }

      // send modified response
      response.send(res);
    });
}
