var config = require('./config');
var express = require('express');
var url = require('url');
var Uber = require('node-uber');
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

// diable view engine for static content delivery
app.set('view options', {
    layout: false
});

var server = app.listen(config.express.port, 'localhost', function() {
    console.log(config.express.app_name + ' listening at http://%s:%s', server.address().address, server.address().port);
});

// get statis pages from web folder
app.use(express.static(__dirname + '/web'));

// show Take Me Home Now! app
app.get('/', function(req, res) {
    res.render('index.html');
});

// login with uber credentials
app.get('/api/login', function(request, response) {
    response.redirect(uber.getAuthorizeUrl(config.uber.scopes));
});

// process callback and redirect with access_token
app.get('/api/callback', function(request, response) {
    uber.authorization({
        authorization_code: request.query.code
    }, function(err, access_token, refresh_token) {
        if (err) {
            console.error(err);
        } else {
            response.send('<script>window.close()</script>');
        }
    });
});

// get all uber products for location
app.get('/api/products', function(request, response) {
    var query = url.parse(request.url, true).query;

    // if no query params sent, respond with Bad Request
    if (!query || !query.lat || !query.lng) {
        response.sendStatus(400);
    } else {
        getProducts(query.lat, query.lng, response);
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

// get profile endpoint
app.get('/api/profile', function(request, response) {
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
    if (!query || !query.lat || !query.lng || !query.product_id) {
        response.sendStatus(400);
    } else {
        getHomeEstimate(query.product_id, query.lat, query.lng, response);
    }
});

// set surge and availability
app.get('/api/products/update', function(request, response) {
    var query = url.parse(request.url, true).query;

    // if no query params sent, respond with Bad Request
    if (!query || !query.product_id) {
        response.sendStatus(500);
    } else {
        updateProduct(query.product_id, response);
    }
});

// accept current ride
app.get('/api/requests/accept', function(request, response) {
    var query = url.parse(request.url, true).query;

    // if no query params sent, respond with Bad Request
    if (!query || !query.request_id) {
        response.sendStatus(500);
    } else {
        updateRequest(query.request_id, 'accepted', response);
    }
});

// start current ride
app.get('/api/requests/start', function(request, response) {
    var query = url.parse(request.url, true).query;

    // if no query params sent, respond with Bad Request
    if (!query || !query.request_id) {
        response.sendStatus(500);
    } else {
        updateRequest(query.request_id, 'in_progress', response);
    }
});

// complete current ride
app.get('/api/requests/complete', function(request, response) {
    var query = url.parse(request.url, true).query;

    // if no query params sent, respond with Bad Request
    if (!query || !query.request_id) {
        response.sendStatus(500);
    } else {
        updateRequest(query.request_id, 'completed', response);
    }
});

// experimental
app.get('/receipt', function(request, response) {
    getReceiptForLastRide(response);
});

app.get('/complete', function(request, response) {
    getCompleteRide(response);
});

app.get('/map', function(request, response) {
    getCompleteRide(response);
});

function getCompleteRide(response) {
    uber.requests.getMapByIDAync('00f2d60a-5ca9-4a16-9e15-f3fdc7ece64c').then(function(res) {
        if (err) {
            console.log(err);
            response.send(err);
        } else {
            response.send(res);
        }
    });
};

function getHomeEstimate(product_id, lat, lng, response) {
    uber.requests.getEstimates({
        'product_id': product_id,
        'start_latitude': lat,
        'start_longitude': lng,
        'end_place_id': 'home'
    }, function(err, res) {
        if (err) {
            console.log(err);
            response.sendStatus(500);
        } else {
            response.send(res);
        }
    });
}

function getProducts(lat, lon, response) {
    uber.products.getAllForLocation(lat, lon, function(err, res) {
        if (err) {
            console.log(err);
            response.sendStatus(500);
        } else {
            response.send(res);
        }
    });
}

function getCurrentRequest(response) {
    uber.requests.getCurrent(function(err, res) {
        if (err) {
            console.log(err);
            response.sendStatus(500);
        } else {
            response.send(res);
        }
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
            response.sendStatus(500);
        } else {
            response.send(res);
        }
    });
}

function updateRequest(request_id, status, response) {
    uber.requests.setStatusByID(request_id, status, function(err, res) {
        if (err) {
            console.log(err);
            response.sendStatus(500);
        } else {
            response.send(res);
        }
    });
}

function updateProduct(product_id, response) {
    uber.products.setSurgeMultiplierByID(product_id, 1.0, function(err, res) {
        if (err) {
            console.log(err);
            response.sendStatus(500);
        } else {
            uber.products.setDriversAvailabilityByID(product_id, true, function(err2, res2) {
                if (err2) {
                    console.log(err2);
                    response.sendStatus(500);
                } else {
                    response.send(res2);
                }
            });
        }
    });
}

function getUberProfile(response) {
    uber.user.getProfile(function(err, res) {
        if (err) {
            console.log(err);
            response.sendStatus(500);
        } else {
            response.send(res);
        }
    });
}
