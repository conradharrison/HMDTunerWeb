/*!
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

/*global alert, btoa, confirm, window, document, XMLSerializer,
  angular, Firebase, gapi, qrcode, Snap, WURFL, CARDBOARD, CONFIG, ga*/

var QR_PIXELS_PER_CELL = 3;

// For QR type 5, 32 characters of usable data.
var PARAM_QR_CUSTOM_PADDING = {
  data_offset_bytes: 35,
  mask_override: 1,
  random_seed: 'seed5',
  pad_bytes: [
  0x06, 0xcc, 0xcc, 0xcc, 0xcc, 0xce, 0x45, 0x6e,
  0x57, 0x00, 0x19, 0x99, 0x99, 0x99, 0x98, 0x09,
  0xee, 0x2c, 0xe0, 0x66, 0xc6, 0x66, 0x4e, 0x60,
  0x14, 0xd2, 0x6e, 0x08, 0x1a, 0x9d, 0x19, 0x58,
  0xb8, 0x0a, 0x40, 0xdd, 0x60, 0x74, 0x6a, 0x62,
  0xe5, 0x60, 0x4d, 0x2d, 0x58, 0x88, 0x19, 0xc9,
  0xab, 0x8d, 0x98, 0x16, 0x58, 0x1b, 0x20, 0x66,
  0x60, 0x60, 0x66, 0x60, 0x4d, 0x46, 0xad, 0x51,
  0xcc, 0xcd, 0x99, 0xcc, 0xcd, 0x85,
  ],
};

var HELPER_PARAMETER_MODAL = {
  'screen_to_lens_distance': {
    focus: 'vendor',
    title: 'Screen to lens distance&nbsp;(mm)',
    content: '<img src="images/screen-to-lens.png" height="638" width="786" class="img-responsive" alt=" " /><p><strong>Note:</strong> If your viewer comes with an adjustable focal distance, measure the average distance between the screen and the&nbsp;lenses.</p><p class="help"><a href="https://support.google.com/cardboard/manufacturers/checklist/6322188" target="_blank">Help &nbsp;<img src="images/help-invert.png" height="19" width="19" alt="?" /><paper-ripple></paper-ripple></a></p>',
  },
  'inter_lens_distance': {
    focus: 'vendor',
    title: 'Inter&#45;lens distance&nbsp;(mm)',
    content: '<img src="images/interlens-distance.png" height="638" width="786" class="img-responsive" alt=" " /><p><strong>Note:</strong> If your viewer comes with an adjustable inter-lens distance, measure the average distance between the screen and the&nbsp;lenses. </p><p class="help"><a href="https://support.google.com/cardboard/manufacturers/checklist/6322188" target="_blank">Help &nbsp;<img src="images/help-invert.png" height="19" width="19" alt="?" /><paper-ripple></paper-ripple></a></p>',
  },
  'distortion_coefficients': {
    focus: 'vendor',
    title: 'Distortion Coefficients',
    content: '<p>View the lens calibration VR scene which appears on your smartphone. Adjust the data until the vertical lines appear straight and angles appear right (90 degrees) through your viewer&nbsp;lenses.</p><div class="hide-in-modal"><p>This is the current lens curvature for your distortion&nbsp;coefficients:</p><p class="text-center"><div id="canvas-container"><canvas id="distortion_plot" width="140" height="280" style="width:auto; height: 100%;"></canvas></div></p></div><p><strong>Note:</strong> distortion coefficients should not be left set to 0.00 for any curved lens.</p><p class="help"><a href="https://support.google.com/cardboard/manufacturers/checklist/6322188" target="_blank">Help &nbsp;<img src="images/help-invert.png" height="19" width="19" alt="?" /><paper-ripple></paper-ripple></a></p>',
  },
  'left_eye_field_of_view_angles': {
    focus: 'vendor',
    title: 'Field-of-view angle',
    content: '<p>Enter the field-of-view angles for your left lens. For most viewers these fields should be set to 50 degrees or&nbsp;more.</p><p class="help"><a href="https://support.google.com/cardboard/manufacturers/checklist/6322188" target="_blank">Help &nbsp;<img src="images/help-invert.png" height="19" width="19" alt="?" /><paper-ripple></paper-ripple></a></p>',
  },
};

function showAxes(ctx,axes) {
  var x0=axes.x0, h=ctx.canvas.height;
  var y0=axes.y0, w=ctx.canvas.width;
  var xmin = axes.doNegativeX ? 0 : x0;
  ctx.beginPath();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgb(128,128,128)";
  ctx.moveTo(y0,xmin); ctx.lineTo(y0,h);  // X axis
  ctx.moveTo(0,x0);    ctx.lineTo(w,x0);  // Y axis
  ctx.stroke();
}

function funGraph(ctx,axes,func,color,thick) {
  var i, xx, yy, dx=2, x0=axes.x0, y0=axes.y0;
  var xscale=axes.xscale, yscale=axes.yscale;
  var iMax = Math.round((ctx.canvas.height-x0)/dx);
  var iMin = axes.doNegativeX ? Math.round(-x0/dx) : 0;
  ctx.beginPath();
  ctx.lineWidth = thick;
  ctx.strokeStyle = color;

  for (i=iMin;i<=iMax;i++) {
    xx = dx*i; yy = yscale*func(xx/xscale);
    if (i===iMin) {
      ctx.moveTo(y0-yy,x0+xx);
    } else {
      ctx.lineTo(y0-yy,x0+xx);
    }
  }
  ctx.stroke();
}

function distortionPlot(k1, k2) {
  var canvas = document.getElementById("distortion_plot");
  var ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  var axes = {
    x0: 0.5 + 0.5*canvas.height,  // x0 pixels from left to x=0
    y0: 0.5 + 0.8*canvas.width,   // y0 pixels from top to y=0
    // TODO: correct x range
    xscale: canvas.height / 2,    // num. pixels from x=0 to x=1
    yscale: canvas.width / 2,
    doNegativeX: true,
  };

  showAxes(ctx,axes);
  funGraph(ctx,axes, function(x) {
    return 1 + k1 * Math.pow(x, 2) + k2 * Math.pow(x, 4);
  }, "rgb(255,110,64)", 2);
}

function makeQr(minType, correctionLevel, text, customPadding) {
  var qr, type = minType;
  // TODO: something more efficient than trial & error
  while (true) {
    try {
      qr = qrcode(type, correctionLevel, customPadding);
      qr.addData(text);
      qr.make();
      return qr;
    } catch (e) {
      if (!e.message.match(/code length overflow/)) {
        throw e;
      }
      ++type;
    }
  }
}

// rotate image proper in place, without CSS
function rotateImg(img, radians) {
  var canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  var canvas_context = canvas.getContext('2d');
  canvas_context.translate(img.width/2, img.height/2);
  canvas_context.rotate(radians);
  canvas_context.drawImage(img, -img.width/2, -img.height/2);
  img.src = canvas.toDataURL();
}

// generate SVG from an image, mapping pixels to rects
function svgFromImage(img, imgScale) {
  var canvas = document.createElement('canvas');
  var width = canvas.width = img.width;
  var height = canvas.height = img.height;
  var canvas_context = canvas.getContext('2d');
  canvas_context.drawImage(img, 0, 0);
  // 8-bit RGBA pixel array from top-left to bottom-right
  var pixels = canvas_context.getImageData(0, 0, width, height).data;
  var x, y;
  var svg = new Snap(width, height);
  // Snap library annoyingly assumes we want the element appended to document
  svg.node.parentNode.removeChild(svg.node);
  svg.rect(0, 0, width, height).attr({fill: 'white'});
  var black_pixels = svg.g().attr({fill: 'black'});
  for (y = 0; y < height; y += imgScale) {
    for (x = 0; x < width; x += imgScale) {
      if (pixels[(x + y * width) * 4] < 128) {
        black_pixels.add(svg.rect(x, y, imgScale, imgScale));
      }
    }
  }
  return svg.node;
}

function areArraysEqual(arr1, arr2) {
  var i;
  if (arr1 === arr2) {
    return true;
  }
  if (arr1 === null || arr2 === null || arr1.length !== arr2.length) {
    return false;
  }
  for (i = 0; i < arr1.length; ++i) {
    if(arr1[i] !== arr2[i]) {
      return false;
    }
  }
  return true;
}

angular
.module('myApp', ['firebase', 'ui.bootstrap', 'ngAnimate', 'ngMaterial', 'ngScrollSpy'])

.config(function($mdThemingProvider) {
  $mdThemingProvider.definePalette('cardboard-orange', {
    '50': 'ff6e40',
    '100': 'ff6e40',
    '200': 'ff6e40',
    '300': 'ff6e40',
    '400': 'ff6e40',
    '500': 'ff6e40',
    '600': 'ff6e40',
    '700': 'ff6e40',
    '800': 'ff6e40',
    '900': 'ff6e40',
    'A100': 'ff6e40',
    'A200': 'ff6e40',
    'A400': 'ff6e40',
    'A700': 'ff6e40',
    'contrastDefaultColor': 'light',
    'contrastDarkColors': ['50', '100', '200', '300', '400', 'A100'],
    'contrastLightColors': undefined
  });

  $mdThemingProvider.definePalette('cardboard-blue', {
    '50': '4787f1',
    '100': '4787f1',
    '200': '4787f1',
    '300': '4787f1',
    '400': '4787f1',
    '500': '4787f1',
    '600': '4787f1',
    '700': '4787f1',
    '800': '4787f1',
    '900': '4787f1',
    'A100': '4787f1',
    'A200': '4787f1',
    'A400': '4787f1',
    'A700': '4787f1',
    'contrastDefaultColor': 'light',
    'contrastDarkColors': ['50', '100', '200', '300', '400', 'A100'],
    'contrastLightColors': undefined
  });

  $mdThemingProvider.theme('default')
  .primaryPalette('cardboard-orange', {
        'default': '800', // by default use shade 400 from the pink palette for primary intentions
        'hue-1': '100', // use shade 100 for the <code>md-hue-1</code> class
        'hue-2': '600', // use shade 600 for the <code>md-hue-2</code> class
        'hue-3': 'A100' // use shade A100 for the <code>md-hue-3</code> class
      })
  .accentPalette('cardboard-blue');})

.animation('.slide-margin', function($animateCss) {
  var animation = {
    enter : function(element, done) {
      var animator = $animateCss(element, {
        from: {
          maxHeight: '0vh'
        },
        to: {
          maxHeight: '100vh'
        },
        duration: 0.75
      });
      animator.start().finally(done);
    },
    leave : function(element, done) {
      var animator = $animateCss(element, {
        from: {
          maxHeight: '100vh'
        },
        to: {
          maxHeight: '0vh'
        },
        duration: 0.3
      });
      animator.start().finally(done);
    },
    move : function(element, done) {
    },
    addClass : function(element, className, done) {
    },
    removeClass : function(element, className, done) {
    }
  };
  return animation;})

.controller('ModalInstanceCtrl', function ($scope, $modalInstance) {
  $scope.ok = function () {
    $modalInstance.close();
  };
})

.controller('ModalCtrl', function ($scope, $modal) {
  $scope.open = function () {
    $modal.open({
      templateUrl: 'compatibleSmartphones.html',
      controller: 'ModalInstanceCtrl',
      size: 'lg',
    });
  };
})

.controller('myController', ['$scope', '$firebase', '$timeout', '$q', '$window', '$mdDialog',
  function($scope, $firebase, $timeout, $q, $window, $mdDialog) {
      var firebase_root = new Firebase(CONFIG.FIREBASE_URL);

      $scope.alert = '';

      $scope.showDetailsModal = function(ev) {
        $mdDialog.show({
          targetEvent: ev,
          clickOutsideToClose: true,
          parent: angular.element(document.body),
          ok: 'Got it!',
          ariaLabel: HELPER_PARAMETER_MODAL[$scope.focus].title,
          title: HELPER_PARAMETER_MODAL[$scope.focus].title,
          template: '<md-dialog>' +
                    '<md-toolbar>' +
                    '<div class="md-toolbar-tools">' +
                    '<h2>' + HELPER_PARAMETER_MODAL[$scope.focus].title + '</h2>' +
                    '<span flex></span>' +
                    '</div>' +
                    '</md-toolbar>' +
                    '<md-dialog-content>' +
                    HELPER_PARAMETER_MODAL[$scope.focus].content +
                    '</md-dialog-content>' +
                    '</md-dialog>',
        }).then(function(answer) {
        }, function() {
        });
      };

      $scope.steps = { WELCOME: 0, OUTPUT: 1};
      $scope.wizard_step = $scope.steps.WELCOME;

      $scope.helper_sections = HELPER_PARAMETER_MODAL;

      $scope.alerts = [];
      $scope.focus = null;
      $scope.isAdvancedExpanded = false;
      $scope.is_mobile = WURFL.is_mobile;

      $scope.closeAlert = function(index) {
        $scope.alerts.splice(index, 1);
      };

      $scope.save = function() {

        $scope.data.update_timestamp = Firebase.ServerValue.TIMESTAMP;
        $scope.data.screen_to_lens_distance = $scope.params.screen_to_lens_distance;
        $scope.data.inter_lens_distance = $scope.params.inter_lens_distance;
        $scope.data.distortion_coefficients = $scope.params.distortion_coefficients;
        $scope.data.left_eye_field_of_view_angles = $scope.params.left_eye_field_of_view_angles;
        $scope.data.$save();

        distortionPlot(
          $scope.params.distortion_coefficients[0],
          $scope.params.distortion_coefficients[1]);
      };

      // true if current settings have non-default "advanced" field values
      var hasAdvancedSettings = function() {
        return ($scope.params !== undefined)
            && (!areArraysEqual($scope.params.left_eye_field_of_view_angles, [50, 50, 50, 50]));
      };

      $scope.$watch('wizard_step', function(value) {
        var virtual_page;
        switch (value) {
          case $scope.steps.OUTPUT:
            break;
          case $scope.steps.WELCOME:
            virtual_page = window.location.pathname + 'form';
            break;
        }
        $scope.isAdvancedExpanded = hasAdvancedSettings();
      });

      $scope.reset = function() {
        $scope.params = {
          "screen_to_lens_distance": 0.042,
          "inter_lens_distance": 0.060,
          "distortion_coefficients": [0, 0],
          "left_eye_field_of_view_angles": [50, 50, 50, 50],
        };

        $scope.isAdvancedExpanded = false;
        $scope.save();
      };

      $scope.saveOrLoadParameters = {
        open: false
      };

      // Called when user changes params URI input field.
      $scope.set_params = function() {
        $scope.params = {
          "screen_to_lens_distance": $scope.data.screen_to_lens_distance,
          "inter_lens_distance": $scope.data.inter_lens_distance,
          "distortion_coefficients": $scope.data.distortion_coefficients,
          "left_eye_field_of_view_angles": $scope.data.left_eye_field_of_view_angles,
        };
        $scope.save();
        $scope.isAdvancedExpanded = hasAdvancedSettings();
      };

      $timeout(function () {
        console.log("Calling firebase authAnonymously()...");
        if (!firebase_root.getAuth()) {
          console.log("Firebase getAuth is null (false)");
          firebase_root.authAnonymously(function(error, authData) {
            if (error) {
              console.log("Firebase login with authAnonymously() failed.", error);
              $scope.alerts.push({ type: 'danger',
                msg: 'Firebase login with authAnonymously() failed.'});
            } else {
                console.log("Firebase authAnonymously() successful");
            }
          });
        }
      });

      firebase_root.onAuth(function(authData) {
        // Note that onAuth will call given function immediately if user is
        // already authenticated.  Use $timeout to ensure we consistently
        // run within digest loop.
        // TODO: use angularfire $onAuth
        $timeout(function() {
          if (authData) {
            console.log("Authenticated on Firebase via provider",
              authData.provider);
            $scope.firebase_token = authData.token;
            console.log("Token=", $scope.firebase_token);
            var firebase_user = firebase_root.child('users').child(authData.uid);
            $scope.data = $firebase(firebase_user).$asObject();
            // init form data on initial load
            // TODO: listen for out-of-band changes to params_uri
            $scope.data.$loaded().then(function(data) {
              if ($scope.data.screen_to_lens_distance == null) {
                console.log("Resetting for the first time")
                $scope.reset();
              } else {
                console.log("Initing for the second time")
                $scope.set_params();
              }
            });

            // generate remote QR code
            // Remote link href won't be available until next $digest cycle.
            $timeout(function () {
                  var qr = makeQr(2, 'L', $scope.firebase_token);
                  document.getElementById('remote_qrcode').innerHTML = qr.createImgTag(QR_PIXELS_PER_CELL);
            });

            // Manage auto-advance from welcome step once remote scene paired.
            // Advance only allowed when starting from no active connections.
            firebase_user.child('connections').on('value', function(connections) {
              if (connections.val()) {
                if ($scope.allow_auto_advance &&
                  $scope.wizard_step === $scope.steps.WELCOME) {
                  $scope.wizard_step = $scope.steps.WELCOME;
                }
                $scope.allow_auto_advance = false;
              } else {
                  $scope.allow_auto_advance = true;
              }
            });
          } else {
            console.log("Not authenticated on Firebase.");
          }
        });
      });
  }
])

.config(function($provide) {
  $provide.decorator("$exceptionHandler", ['$delegate', function($delegate) {
    return function(exception, cause) {
      $delegate(exception, cause);
      alert("An error has occurred.\n\n" + exception.message);
    };
  }]);
})

.config(['$compileProvider', function($compileProvider) {
  // allow data:image, for our image download links
  $compileProvider.aHrefSanitizationWhitelist(
    /^\s*((https?|ftp|mailto|tel|file):|data:image\/)/);
}])

.filter('raw_html', ['$sce', function($sce){
  return function(val) {
    return $sce.trustAsHtml(val);
  };
}])

// Validation for zero distortion coefficients
.directive('ngNonZero',
  function() {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function($scope, $elem, $attrs, ngModel) {
        $scope.$watch($attrs.ngModel, function(value) {
          var isValid = (value !== 0);
          ngModel.$setValidity($attrs.ngModel, isValid);
        });
      }
    };
  })

// Scale model-to-view by given factor and vice versa.
.directive('myScale',
  function() {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function(scope, elem, attrs, ngModel) {
        var scale = parseInt(attrs.myScale, 10);
        // model-to-view
        ngModel.$formatters.push(
          function(val) {
            if (val) {
              return val * scale;
            }
          });
        // view-to-model
        ngModel.$parsers.push(
          function (val) {
            var parsed = parseFloat(val);
            if (isNaN(parsed)) {
              return null;
            }
            return parsed / scale;
          });
      }
    };
  })

// Round view of numeric value to given fractional digits.
.directive('roundView',
  function() {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function(scope, elem, attrs, ngModel) {
        var fraction_digits = parseInt(attrs.roundView, 10);
        // model-to-view
        // Can't use a formatter here since we want full fixed point display
        // (e.g. 0 rendered as "0.00").
        ngModel.$render = function() {
          if (ngModel.$isEmpty(ngModel.$viewValue)) {
            elem.val('');
          } else {
            elem.val(Number(ngModel.$viewValue).toFixed(fraction_digits));
          }
        };
        ngModel.$viewChangeListeners.push(function() {
          ngModel.$render();
        });
      }
    };
  })
;
