$(function() {
  // enable strict mode
  'use strict';

  var map, myLatlng, user, selectedProduct;
  var access_token = getParameterByName('access_token');

  // if token available, load user info
  if (access_token && !user) {
    loadUserProfile();
  }

  // get location onload
  getLocation();

  // set event listeners
  document.getElementById("btnRequestHome").addEventListener("click", requestProductHome);

  // extract URL query parameters:
  // http://stackoverflow.com/questions/901115/how-can-i-get-query-string-values-in-javascript
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

  // get user object and initialize UI for logged in users
  function loadUserProfile() {
    $.ajax({
        url: '/api/user/profile?access_token=' + access_token
      })
      .done(function(msg) {
        user = msg;
        initLoginUI();
      });
  }

  // get accurate arrival time and price estimation
  function loadHomeEstimate() {
    $.ajax({
        url: '/api/estimate/home?lat=' + myLatlng.lat() + '&lng=' + myLatlng.lng()
      })
      .done(function(msg) {

        // find uberx product
        msg.prices.forEach(function(value) {
          if (value.display_name === 'uberX') {
            $('#btnRequestHome').text('Take me home by ' + addMinutesAndFormat(new Date(), (value.duration / 60)) + ' for just ' + value.estimate);
            return;
          }
        });
      });
  }

  // repaint method for UI changes after user logged in
  function initLoginUI() {
    // update button setup
    $('#btnRequestHome').text('Take me home');
    $('.fullscreenLoader').css('display', 'none');

    //show profile image
    $('#btnProfile').html('<img class="imgProfile" src="' + user.picture + '" alt="Profile Image" />');

    // set uber gender variant
    if (user.gender === 'male') {
      $('#uberLogoWrapper').addClass('male');
      $('.imgProfile').addClass('imgMale');
      $('.btn-success').addClass('btnMale');
    } else {
      $('#uberLogoWrapper').addClass('female');
      $('.imgProfile').addClass('imgFemale');
      $('.btn-success').addClass('btnFemale');
    }
  }

  // use HTML5 feature to get browser-based location
  function getLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(showPosition);
    }
  }

  function requestProductHome() {
    if (!access_token) {
      // let user login
      window.location.href = "/api/login";
    } else if (!selectedProduct) {
      console.log('No uberX found...');
      return;
    }

    // show footer for status updates
    $('.footer').css('visibility', 'visible');
    $('.footer').toggleClass('animated flipInX');

    // initiate ride request
    $.ajax({
        url: '/api/requests/new/home?lat=' + myLatlng.lat() + '&lng=' + myLatlng.lng() + '&product_id=' + selectedProduct
      })
      .done(function(msg) {
        showCurrentRideStatus(msg);
        // get status update every 2secs
        setInterval(getCurrentRide, 2000);
      });

  }

  // initialize map after getting browser-based location
  function showPosition(position) {
    $.getScript("https://maps.googleapis.com/maps/api/js?key=AIzaSyDCJQ0AEpsI0VQ-EFEixeF8OlADTMqUBrM", function() {
      initMap(position.coords.latitude, position.coords.longitude);
      getUberProducts(position.coords.latitude, position.coords.longitude);
    });
  }

  function initMap(lat, lng) {
    myLatlng = new google.maps.LatLng(lat, lng);

    // load estimates for price and arrival time
    if (user) {
      loadHomeEstimate();
    }

    map = new google.maps.Map(document.getElementById('fullScreenMap'), {
      center: myLatlng,
      zoom: 18
    });

    var marker = new google.maps.Marker({
      position: myLatlng,
      title: 'You are here',
      map: map
    });
  }

  function getPaymentMethods() {
    $.ajax({
        url: '/api/payment-methods'
      })
      .done(function(msg) {
        console.log(msg);
      });
  }

  // get current ride status
  function getCurrentRide() {
    $.ajax({
        url: '/api/requests/current'
      })
      .done(function(msg) {
        showCurrentRideStatus(msg);
      });
  }

  // display current ride status
  function showCurrentRideStatus(msg) {
    if (msg.status === 'accepted') {
      $('.footer .loader').css('display', 'none');
      $('.imgDriver').html('<img class="animated flipXIn" src="' + msg.driver.picture_url + '" alt="Driver Image" />');

      if (msg.driver.gender === 'female') {
        $('.imgDriver img').addClass('imgFemale');
      } else {
        $('.imgDriver img').addClass('imgMale');
      }

      if (msg.eta > 1) {
        $('#rideStatus').text(msg.driver.name + ' will pick you up in ' + msg.eta + ' minutes.');
      } else {
        $('#rideStatus').text(msg.driver.name + ' is waiting for you outside!');
      }
    } else if (msg.status === 'processing') {
      $('#rideStatus').html('<p>Waiting to get an assigned driver ...</p>');
    }
  }

  // get all uber products available for location
  function getUberProducts(lat, lng) {
    $.ajax({
        url: '/api/products?lat=' + lat + '&lng=' + lng
      })
      .done(function(msg) {
        findUberXID(msg.products);
      });
  }

  // finds the uberX product_id and sets selectedProduct
  function findUberXID(products) {
    if ($.isArray(products) && products.length > 0) {
      // find uberX product id
      products.forEach(function(value) {
        if (value.display_name === 'uberX') {
          selectedProduct = value.product_id;
          return;
        }
      });
    }
  }

});
