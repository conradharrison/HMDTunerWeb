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

var QR_PIXELS_PER_CELL = 5;

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
  'display_pixels_per_inch': {
    focus: 'vendor',
    title: 'Display pixels-per-inch (pixels)',
    content: '<img src="images/step_1_phones.png" height="638" width="786" class="img-responsive" alt=" " /><p><strong>Note:</strong> Enter the pixel density of your display in pixels-per-inch.</p>',
  },
  'screen_to_lens_distance': {
    focus: 'vendor',
    title: 'Screen to lens distance (mm)',
    content: '<img src="images/screen-to-lens.png" height="638" width="786" class="img-responsive" alt=" " /><p><strong>Note:</strong> If your viewer comes with an adjustable focal distance, measure the average distance between the screen and the lenses.</p>',
  },
  'inter_lens_distance': {
    focus: 'vendor',
    title: 'Inter&#45;lens distance (mm)',
    content: '<img src="images/interlens-distance.png" height="638" width="786" class="img-responsive" alt=" " /><p><strong>Note:</strong> If your viewer comes with an adjustable inter-lens distance, measure the average distance between the screen and the lenses. </p>',
  },
  'distortion_coefficients': {
    focus: 'vendor',
    title: 'Distortion Coefficients',
    content: '<p>View the lens calibration VR scene which appears on your smartphone. Adjust the data until the vertical lines appear straight and angles appear right (90 degrees) through your viewer lenses.</p><div class="hide-in-modal"><p>This is the current lens curvature for your distortion coefficients:</p><p class="text-center"><div id="canvas-container"><canvas id="distortion_plot" width="140" height="280" style="width:auto; height: 100%;"></canvas></div></p></div><p><strong>Note:</strong> distortion coefficients should not be left set to 0.00 for any curved lens.</p>',
  },
  'field_of_view_angles': {
    focus: 'vendor',
    title: 'Field-of-view angle',
    content: '<p>Enter the field-of-view angles for your left lens. For most viewers these fields should be set to 50 degrees or more.</p>',
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

function distortionPlot(kr1, kr2, kg1, kg2, kb1, kb2) {
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
    return 1 + kr1 * Math.pow(x, 2) + kr2 * Math.pow(x, 4);
  }, "rgb(255,20,20)", 2);
  funGraph(ctx,axes, function(x) {
    return 1 + kg1 * Math.pow(x, 2) + kg2 * Math.pow(x, 4);
  }, "rgb(20,255,20)", 2);
  funGraph(ctx,axes, function(x) {
    return 1 + kb1 * Math.pow(x, 2) + kb2 * Math.pow(x, 4);
  }, "rgb(20,20,255)", 2);
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

function checkNull (val) {
  return val == null ? 0 : val;
}

angular
.module('myApp', ['firebase', 'ui.bootstrap', 'ngMaterial'])

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
  .accentPalette('cardboard-blue');
})

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

      $scope.helper_sections = HELPER_PARAMETER_MODAL;

      $scope.alerts = [];
      $scope.focus = null;
      $scope.isAdvancedExpanded = false;
      $scope.is_mobile = WURFL.is_mobile;

      $scope.closeAlert = function(index) {
        $scope.alerts.splice(index, 1);
      };

      $scope.save = function() {
        
        // Firebase removes keys that are set to null. Well, we could check this in the Android app, but this is simpler.
        $scope.data.display_pixels_per_inch = checkNull($scope.params.display_pixels_per_inch);
        $scope.data.screen_to_lens_distance = checkNull($scope.params.screen_to_lens_distance);
        $scope.data.inter_lens_distance = checkNull($scope.params.inter_lens_distance);
        
        var kr = [checkNull($scope.params.distortion_coefficients_r[0]), checkNull($scope.params.distortion_coefficients_r[1])];
        var kg = [checkNull($scope.params.distortion_coefficients_g[0]), checkNull($scope.params.distortion_coefficients_g[1])];
        var kb = [checkNull($scope.params.distortion_coefficients_b[0]), checkNull($scope.params.distortion_coefficients_b[1])];
        $scope.data.distortion_coefficients_r = kr;
        $scope.data.distortion_coefficients_g = kg;
        $scope.data.distortion_coefficients_b = kb;
        
        var va = [checkNull($scope.params.field_of_view_angles[0]), checkNull($scope.params.field_of_view_angles[1]),
                  checkNull($scope.params.field_of_view_angles[2]), checkNull($scope.params.field_of_view_angles[3])];
        $scope.data.field_of_view_angles = va;
        
        $scope.data.$save();  

        distortionPlot(
          $scope.params.distortion_coefficients_r[0],
          $scope.params.distortion_coefficients_r[1],
          $scope.params.distortion_coefficients_g[0],
          $scope.params.distortion_coefficients_g[1],
          $scope.params.distortion_coefficients_b[0],
          $scope.params.distortion_coefficients_b[1]);
        
      };

      // true if current settings have non-default "advanced" field values
      var hasAdvancedSettings = function() {
        return ($scope.params !== undefined)
            && (!areArraysEqual($scope.params.field_of_view_angles, [50, 50, 50, 50]));
      };

      $scope.reset = function() {
        $scope.params = {
          "display_pixels_per_inch": 424,
          "screen_to_lens_distance": 42,
          "inter_lens_distance": 60,
          "distortion_coefficients_r": [0, 0],
          "distortion_coefficients_g": [0, 0],
          "distortion_coefficients_b": [0, 0],
          "field_of_view_angles": [50, 50, 50, 50],
        };

        $scope.isAdvancedExpanded = false;
        $scope.save();
      };

      $scope.saveOrLoadParameters = {
        open: false
      };
      
      $scope.set_params = function() {
        $scope.params = {
          "display_pixels_per_inch": $scope.data.display_pixels_per_inch,
          "screen_to_lens_distance": $scope.data.screen_to_lens_distance,
          "inter_lens_distance": $scope.data.inter_lens_distance,
          "distortion_coefficients_r": $scope.data.distortion_coefficients_r,
          "distortion_coefficients_g": $scope.data.distortion_coefficients_g,
          "distortion_coefficients_b": $scope.data.distortion_coefficients_b,
          "field_of_view_angles": $scope.data.field_of_view_angles,
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
        $timeout(function() {
          if (authData) {
            
            console.log("Authenticated on Firebase via provider", authData.provider);
            $scope.firebase_token = authData.token;
            
            console.log("Token=", $scope.firebase_token);
            var firebase_user = firebase_root.child('users').child(authData.uid);
            
            $scope.data = $firebase(firebase_user).$asObject();

            $scope.data.$loaded().then(function(data) {
              if ($scope.data.screen_to_lens_distance == null) {
                console.log("Resetting for the first time")
                $scope.reset();
              } else {
                console.log("Initing for the second time")
                $scope.set_params();
              }
            });

            $timeout(function () {
                  var qr = makeQr(2, 'L', $scope.firebase_token);
                  document.getElementById('remote_qrcode').innerHTML = qr.createImgTag(QR_PIXELS_PER_CELL);
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

// Round view of numeric value to given fractional digits.
.directive('roundView', function() {
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
