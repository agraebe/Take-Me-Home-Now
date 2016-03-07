# Take-Me-Home-Now
Gender-aware one button UberX pickup with accurate arrival time &amp; price estimation for desktop.

## Early release!
Please be aware that this is a very early release. No tests yet (and probably some bugs), no detailed exception handling and limited scope of functionality (e.g. only UberX requests).

# Key Features
- [x] Get browser-based location
- [x] Usage of the Uber API thanks to [node-uber](https://github.com/shernshiou/node-uber)
- [x] Request Uber ride to Home place - *must be maintained in your Uber profile*
- [x] Home place address conversion to lat and lng through thanks to [GMaps Geocoding](https://developers.google.com/maps/documentation/javascript/geocoding)
- [x] Responsive UI thanks to [Bootstrap 3](http://getbootstrap.com/)
- [x] Nice animations thanks to [Animate.css](https://daneden.github.io/animate.css/)
- [x] Gender analysis for user and rider based on profile picture (thanks to [Face++](https://market.mashape.com/faceplusplus/faceplusplus-face-detection)) and name (thanks to [gender](https://www.npmjs.com/package/gender))
- [x] Adaptive UI based on the gender of Uber user

# Backlog
- [ ] Use the API to create an [iOS Today Extension](https://www.raywenderlich.com/83809/ios-8-today-extension-tutorial). Just like the Waze extenstion, with buttons for predefined places

# Installation
As usual, run this first:
```
npm install
```

## Installation issues
Right now, you will have trouble with a clean slate installation because the project uses a modified version of [node-uber](https://github.com/shernshiou/node-uber). The changes made were proposed in this [pull request](https://github.com/shernshiou/node-uber/pull/13).
Stay tuned for an updated version!

Then, start the server from the root dir with the following command:
```
node app.js
```

After that, you can access the web app by opening ``http://localhost:1455/``.
