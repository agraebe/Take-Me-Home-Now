var express = require('express');
var url = require('url');
var Uber = require('node-uber');
var unirest = require('unirest');
var gender = require('gender');
var request = require('request');

var app = express();
//TODO: Replace CLIENTID, CLIENTSECRET and SERVERTOKEN with your own
var uber = new Uber({
  client_id: 'CLIENTID',
  client_secret: 'CLIENTSECRET',
  server_token: 'SERVERTOKEN',
  redirect_uri: 'http://localhost:1455/api/callback',
  name: 'Take Me Home Now!',
  sandbox: true
});

// introducing the UVER HQ port
app.listen(1455, function() {
  console.log('<Take Me Home Now!> listening on port 1455 ...');
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
  var url = uber.getAuthorizeUrl(['history', 'profile', 'places', 'request']);
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

// get all uber products for location
app.get('/api/products', function(request, response) {
  var url_parts = url.parse(request.url, true);
  var query = url_parts.query;

  // if no query params sent, respond with Bad Request
  if (!query || !query.lat || !query.lng) {
    response.sendStatus(400);
  } else {
    getUberProducts(query.lat, query.lng, response);
  }
});

// create a new ride request to home place
app.get('/api/requests/new/home', function(request, response) {
  var url_parts = url.parse(request.url, true);
  var query = url_parts.query;

  // if no query params sent, respond with Bad Request
  if (!query || !query.lat || !query.lng || !query.product_id) {
    response.sendStatus(400);
  } else {
    createNewRequestHome(query.lat, query.lng, query.product_id, response);
  }
});

// get uber user profile
app.get('/api/user/profile', function(request, response) {
  var url_parts = url.parse(request.url, true);
  var query = url_parts.query;
  getUberProfile(query.access_token, response);
});

// get current request status
app.get('/api/requests/current', function(request, response) {
  getCurrentRequest(response);
});

// get complete estimate for price and arrival time for home place
app.get('/api/estimate/home', function(request, response) {
  var url_parts = url.parse(request.url, true);
  var query = url_parts.query;

  // if no query params sent, respond with Bad Request
  if (!query || !query.lat || !query.lng) {
    response.sendStatus(400);
  } else {
    getCompleteHomeEstimate(query.lat, query.lng, response);
  }
});

function getCompleteHomeEstimate(lat, lng, response) {
  // get home address from profile
  uber.places.home(function(err, res) {
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
      uber.estimates.price({
        start_latitude: lat,
        start_longitude: lng,
        end_latitude: jsonResult.results[0].geometry.location.lat,
        end_longitude: jsonResult.results[0].geometry.location.lng,
      }, function(err3, res3) {
        if (err3) {
          console.error(err3);
          return;
        }

        // to get a complete trip time, add time estimate for driver to arrive
        uber.estimates.time({
          start_latitude: lat,
          start_longitude: lng
        }, function(err4, res4) {
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
  uber.requests.getCurrentRide(
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

function createNewRequestHome(lat, lon, product_id, response) {
  uber.requests.requestRide({
    start_latitude: lat,
    start_longitude: lon,
    product_id: product_id,
    end_place_id: 'home'
  }, function(err, res) {
    if (err) {
      console.error(err);
      return;
    }
    response.send(res);

    // accept the ride automatically after 3 secs
    setTimeout(function() {
      acceptRequest(res.request_id);
    }, 3000);
  });
}

function acceptRequest(request_id) {
  console.log('Accepting request ' + request_id + ' now ...');
  uber.requests.setRequestStatus({
    status: 'accepted',
    request_id: request_id
  }, function(err, res) {
    if (err) {
      console.error(err);
      return;
    }
  });
}

function getUberProducts(lat, lon, response) {
  uber.products.list({
    latitude: lat,
    longitude: lon
  }, function(err, res) {
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
    uber.user.profile(access_token, function(err, res) {
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
    //TODO: Replace MASHAPEKEY with your own
    .header('X-Mashape-Key', 'MASHAPEKEY')
    .header('Accept', 'application/json')
    .end(function(result) {
      // analyze the profile name
      genderGuess = gender.guess(firstName);
      genderGuessConfidence = genderGuess.confidence * 100;
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
