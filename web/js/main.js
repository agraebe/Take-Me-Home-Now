$(function() {
    // enable strict mode
    'use strict';

    var map, myLatlng, user, selectedProduct, currentRequest;

    $('#main').hide();
    $('#estimatesBtnGroup').hide();
    $('#requestBtnGroup').hide();

    // get location onload
    getLocation();

    // set event listeners
    document.getElementById("btnLogin").addEventListener("click", login);

    function getParameterByName(name, url) {
        if (!url) url = window.location.href;
        name = name.replace(/[\[\]]/g, "\\$&");
        var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
            results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, " "));
    }

    // get current time, add minutes and format in hours AM/PM
    function addMinutesAndFormat(date, minutes) {
        var arrivalTime = new Date(date.getTime() + minutes * 60000);
        return arrivalTime.toLocaleTimeString().replace(/:\d+ /, ' ');
    }

    function showCurrentPayload(method, ep, query, payload, response) {
        var output, tab;

        // generate table
        if (query) {
            tab = '<table class="table table-striped">'
            for (var i = 0; i < query.length; i++) {
                tab += '<tr><td>' + query[i].param + '</td><td>' + query[i].val + '</td></tr>';
            }
            tab += '</table>';
        }
        // generate entire output

        output = '<p><b>Method</b>: ' + method + '</p><p><b>Endpoint</b>: ' + ep + '</p>';

        output += query ? '<p><b>Query</b>: ' + tab + '</p>' : '';

        output += payload ? '<p><b>Payload</b>:</p><pre id="payload"><code class="json">' + payload + '</code></pre>' : '';

        output += '<p><b>Response</b>:</p><pre id="response"><code class="json">' + JSON.stringify(response, null, 2) + '</code></pre>';

        $('#sideBar').html(output);

        if (payload) {
            hljs.highlightBlock(document.getElementById('payload'));
        }
        hljs.highlightBlock(document.getElementById('response'));

        // show location on map
        if (response.location) {
            var image = {
                url: response.vehicle.picture_url,
                origin: new google.maps.Point(0, 0),
                anchor: new google.maps.Point(0, 0),
                scaledSize: new google.maps.Size(32, 15)
            };
            var marker = new google.maps.Marker({
                position: new google.maps.LatLng(response.location.latitude, response.location.longitude),
                animation: google.maps.Animation.DROP,
                icon: image,
                title: response.driver.name + ' is on the way!',
                map: map
            });
        }
    }

    // get user object and initialize UI for logged in users
    function loadUserProfile() {
        $('#estimatesBtnGroup').show();
        $('#btnGetEstimates').on('click', getUberEstimates);
        $('#btnDisableSurge').on('click', disableSurge);

        $('#requestBtnGroup').show();
        $('#btnRequestRide').on('click', requestRideHome);
        $('#btnAcceptRide').on('click', acceptRideHome);
        $('#btnStartRide').on('click', startRideHome);
        $('#btnCompleteRide').on('click', completeRideHome);
        $('#btnCurrentRide').on('click', getCurrentRide);

        $('#btnLogin').hide();

        $.ajax({
                url: '/api/profile'
            })
            .done(function(msg) {
                user = msg;
                msg.uuid = 'uuid';
                msg.rider_id = 'rider_id';
                msg.promo_code = 'promo_code';

                $('#btnProfile').html('<img class="imgProfile" src="' + user.picture + '" alt="Profile Image" />');

                showCurrentPayload('GET', '/v1/me', null, null, msg);
            });
    }

    // use HTML5 feature to get browser-based location
    function getLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(showPosition);
        }
    }

    function login(e) {
        var checkConnect;
        var win = window.open('/api/login', 'Login with Uber', 'width=480,height=480,toolbar=0,menubar=0,location=0,modal=1,alwaysRaised=1');

        checkConnect = setInterval(function() {
            if (!win || !win.closed) return;
            clearInterval(checkConnect);

            loadUserProfile();
        }, 100);
    }

    // initialize map after getting browser-based location
    function showPosition(position) {
        $.getScript("https://maps.googleapis.com/maps/api/js?key=AIzaSyDCJQ0AEpsI0VQ-EFEixeF8OlADTMqUBrM", function() {
            initMap(position.coords.latitude, position.coords.longitude);
        });
    }

    function initMap(lat, lng) {
        myLatlng = new google.maps.LatLng(lat, lng);

        $('#btnGetProducts').on('click', getUberProducts);

        $('#main').show();
        $('.loader').hide();

        map = new google.maps.Map(document.getElementById('fullScreenMap'), {
            center: myLatlng,
            zoom: 16
        });

        var marker = new google.maps.Marker({
            position: myLatlng,
            title: 'You are here',
            map: map
        });
    }

    // get current ride status
    function getCurrentRide() {
        $.ajax({
                url: '/api/requests/current'
            })
            .done(function(msg) {
                currentRequest = msg.request_id;
                showCurrentPayload('GET', '/v1/requests/current', null, null, msg);
            });
    }

    // get all uber products available for location
    function getUberProducts() {
        $.ajax({
                url: '/api/products?lat=' + myLatlng.lat() + '&lng=' + myLatlng.lng()
            })
            .done(function(msg) {
                findUberXID(msg.products);
                showCurrentPayload('GET', '/v1/products', [{
                    'param': 'latitude',
                    'val': myLatlng.lat()
                }, {
                    'param': 'longitude',
                    'val': myLatlng.lng()
                }], null, msg);
            });
    }

    function disableSurge() {
        $.ajax({
                url: '/api/products/update?product_id=' + selectedProduct
            })
            .done(function(msg) {
                showCurrentPayload('PUT', '/v1/sandbox/products/' + selectedProduct, null, '{"surge_multiplier": 1.0,"drivers_available": true"}', msg);
            });
    }

    function acceptRideHome() {
        $.ajax({
                url: '/api/requests/accept?request_id=' + currentRequest
            })
            .done(function(msg) {
                showCurrentPayload('PUT', '/v1/sandbox/requests/' + currentRequest, null, '{"status": "accepted"}', msg);
            });
    }

    function startRideHome() {
        $.ajax({
                url: '/api/requests/start?request_id=' + currentRequest
            })
            .done(function(msg) {
                showCurrentPayload('PUT', '/v1/sandbox/requests/' + currentRequest, null, '{"status": "in_progress"}', msg);
            });
    }

    function completeRideHome() {
        $.ajax({
                url: '/api/requests/complete?request_id=' + currentRequest
            })
            .done(function(msg) {
                showCurrentPayload('PUT', '/v1/sandbox/requests/' + currentRequest, null, '{"status": "completed"}', msg);
            });
    }

    function requestRideHome() {
        if (!selectedProduct) {
            $.ajax({
                    url: '/api/products?lat=' + myLatlng.lat() + '&lng=' + myLatlng.lng()
                })
                .done(function(msg) {
                    findUberXID(msg.products, callRequest);
                });
        } else {
            callRequest();
        }
    }

    function callRequest() {
        $.ajax({
                url: '/api/requests/new/home?product_id=' + selectedProduct + '&lat=' + myLatlng.lat() + '&lng=' + myLatlng.lng()
            })
            .done(function(msg) {
                currentRequest = msg.request_id;

                showCurrentPayload('POST', '/v1/requests', [{
                    'param': 'product_id',
                    'val': selectedProduct
                }, {
                    'param': 'start_latitude',
                    'val': myLatlng.lat()
                }, {
                    'param': 'start_longitude',
                    'val': myLatlng.lng()
                }, {
                    'param': 'end_place_id',
                    'val': 'home'
                }], null, msg);
            });
    }

    // get all uber products available for location
    function getUberEstimates() {
        if (!selectedProduct) {
            $.ajax({
                    url: '/api/products?lat=' + myLatlng.lat() + '&lng=' + myLatlng.lng()
                })
                .done(function(msg) {
                    findUberXID(msg.products, callEstimes);
                });
        } else {
            callEstimes();
        }
    }

    function callEstimes() {
        $.ajax({
                url: '/api/estimate/home?product_id=' + selectedProduct + '&lat=' + myLatlng.lat() + '&lng=' + myLatlng.lng()
            })
            .done(function(msg) {
                showCurrentPayload('POST', '/v1/requests/estimate', [{
                    'param': 'product_id',
                    'val': selectedProduct
                }, {
                    'param': 'start_latitude',
                    'val': myLatlng.lat()
                }, {
                    'param': 'start_longitude',
                    'val': myLatlng.lng()
                }, {
                    'param': 'end_place_id',
                    'val': 'home'
                }], null, msg);
            });
    }

    // finds the uberX product_id and sets selectedProduct
    function findUberXID(products, next) {
        if ($.isArray(products) && products.length > 0) {
            // find uberX product id
            products.forEach(function(value) {
                if (value.display_name === 'uberX') {
                    selectedProduct = value.product_id;
                    if (next) {
                        next();
                    }
                    return;
                }
            });
        }
    }

});
