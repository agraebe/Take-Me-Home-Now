var config = require('./config');
var express = require('express');
var url = require('url');
var Uber = require('node-uber');
var unirest = require('unirest');
var gender = require('gender');
var Promise = require('bluebird');
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
    uber.authorizationAsync({
        authorization_code: request.query.code
    }).then(function(res) {
        response.redirect('/index.html?access_token=' + res);
    });
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

    getUberProfile(response);
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
    uber.places.getHomeAsync().then(function(res) {
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
            uber.estimates.getPriceForRouteAsync(lat, lng, jsonResult.results[0].geometry.location.lat,
                jsonResult.results[0].geometry.location.lng).then(function(res3) {
                // to get a complete trip time, add time estimate for driver to arrive
                uber.estimates.getETAForLocationAsync(lat, lng).then(function(res4) {
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
    uber.requests.getCurrentAsync().then(function(res) {
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
    uber.requests.createAsync({
        start_latitude: lat,
        start_longitude: lon,
        product_id: product_id,
        end_place_id: 'home'
    }).then(function(res) {
        response.send(res);

        // accept the ride automatically after 3 secs
        setTimeout(function() {
            acceptRequest(res.request_id);
        }, 3000);
    }).catch(function(err) {
        response.sendStatus(500);
    });
}

function acceptRequest(request_id) {
    uber.requests.setStatusByIDAsync(request_id, 'accepted');
}

function getUberProducts(lat, lon, response) {
    uber.products.getAllForLocationAsync(lat, lon).then(function(res) {
        response.send(res);
        // simulate surge multiplier
        setSurgeMultiplierForUberX(res.products[0].product_id, 1.0);
    });
}

function setSurgeMultiplierForUberX(product_id, multiplier) {
    uber.products.setSurgeMultiplierByIDAsync(product_id, multiplier);
}

function getUberProfile(response) {
    uber.user.getProfileAsync().then(function(res) {
        if (res.picture && res.picture !== '') {
            identifyGenderAndRespond(res, response);
        } else {
            // just in case there is no image
            response.sendStatus(400);
        }
    });
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
