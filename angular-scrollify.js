(function() {
  'use strict';

  var module = angular.module('hj.scrollify', []);

  module.factory('throttle', function() {
    var last = +new Date();

    return function(delay, fn) {
      var now = +new Date();

      if (now - last >= delay) {
        last = now;
        fn();
      }
    };
  });

  module.factory('debounce', ['$timeout', function($timeout) {
    return function(wait, fn) {
      /* jshint validthis:true */

      var args;
      var context;
      var result;
      var timeout;

      function ping() {
        result = fn.apply(context || this, args || []);
        context = args = null;
      }

      function cancel() {
        if (timeout) {
          $timeout.cancel(timeout);
          timeout = null;
        }
      }

      function flushPending() {
        var pending = !!context;
        if (pending) {
          cancel();
          ping();
        }
        return pending;
      }

      function debounceFn() {
        context = this;
        args = arguments;
        cancel();
        timeout = $timeout(ping, wait);
      }

      debounceFn.flush = function() {
        if (!flushPending() && !timeout) {
          ping();
        }
        return result;
      };

      debounceFn.flushPending = function() {
        flushPending();
        return result;
      };

      debounceFn.cancel = cancel;

      return debounceFn;
    };
  }]);

  module.directive('hjScrollify', ['$window', '$document', '$timeout', '$log', 'throttle', 'debounce',
    function($window, $document, $timeout, $log, throttle, debounce) {
      return {
        restrict: 'A',
        transclude: true,
        template: '' +
        '<div class="scrollify__dummy"></div>' +
        '<div class="scrollify__container">' +
        '    <div class="scrollify__wrapper">' +
        '        <div class="scrollify__slider">' +
        '            <div class="scrollify__pane" ng-transclude></div>' +
        '        </div>' +
        '    </div>' +
        '</div>',
        compile: function(_element, _attr, linker) {
          return function link($scope, $element, $attrs) {
            var expression = $attrs.hjScrollify;
            var match = expression.match(/^\s*(.+)\s+in\s+(.*?)\s*$/);
            var valueIdentifier;
            var listIdentifier;

            if (!match) {
              $log.error('Expected hjScrollify in form of "_item_ in _array_" but got "' + expression + '".');
            }

            valueIdentifier = match[1];
            listIdentifier = match[2];

            var options;

            var defaults = {
              container: 'window', // window/element - defines what to use for height measurements and scrolling
              id: +new Date(), // `id` if using multiple instances
              scrollSpeed: 600, // transition time between panes (ms)
              scrollSpeedModifier: 3, // root factor to calculate `scrollSpeed` by when moving more than 1 pane
              scrollBarModifier: 0.25, // length of container as a percentage of "real" length (prevents tiny handle on long pages)
              wheelThrottle: 300,
              scrollDebounce: 50,
              touchEnabled: true,
              fixedPosition: false,
              initDelay: 0,
              startIndex: false, // optional
            };

            if ($attrs.hjScrollifyOptions !== undefined) {
              var origOptions = $scope.$eval($attrs.hjScrollifyOptions);

              options = angular.extend(defaults, origOptions);

              $scope.$watch(function() {
                var checkOptions = $scope.$eval($attrs.hjScrollifyOptions);

                if (!angular.equals(origOptions, checkOptions)) {
                  origOptions = checkOptions;
                }

                return origOptions;
              }, function(newOptions) {
                options = angular.extend(defaults, newOptions);
              });

            } else {
              options = defaults;
            }

            var getPrefix = function(prop) {
              var prefixes = ['Moz', 'Khtml', 'Webkit', 'O', 'ms'];
              var el = document.createElement('div');
              var upper = prop.charAt(0).toUpperCase() + prop.slice(1);

              if (prop in el.style) {
                return prop;
              }

              for (var len = prefixes.length; len--;) {
                if ((prefixes[len] + upper) in el.style) {
                  return (prefixes[len] + upper);
                }
              }

              return false;
            };

            var isTouch = ('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch;
            var prefixedTransform = getPrefix('transform');
            var prefixedTransitionDuration = getPrefix('transitionDuration');

            var scrollifyEl = $element[0];
            var container = scrollifyEl.querySelector('.scrollify__container');
            var dummy = scrollifyEl.querySelector('.scrollify__dummy');
            var wrapper = scrollifyEl.querySelector('.scrollify__wrapper');
            var slider = scrollifyEl.querySelector('.scrollify__slider');
            var $slider = angular.element(slider);
            var $templatePane = angular.element(scrollifyEl.querySelector('.scrollify__pane'));

            var list = [];
            var panes = [];
            var currentPane;
            var prevPane = null;
            var preventScroll = false;

            if (options.fixedPositon) {
              angular.element(container).addClass('scrollify__container--fixed');
            }

            var buildPanes = function() {
              $slider.children().remove();

              for (var i = 0; i < list.length; i++) {
                var pane = {};
                pane.$scope = $scope.$new();
                pane.$scope.$index = i;
                panes.push(pane);

                linker(pane.$scope, function(clone) {
                  var paneClone = $templatePane.clone();
                  paneClone.children().replaceWith(clone);
                  $slider.append(paneClone);
                  pane.$element = paneClone;
                });

                angular.element(pane.$element).attr('data-index', i);
              }

              for (i = 0; i < list.length; i++) {
                panes[i].$scope[valueIdentifier] = list[i];

                if (panes[i].$scope.$$phase === false) {
                  panes[i].$scope.$apply();
                }
              }
            };

            var setCurrentPane = function(i) {
              if (!panes[i]) {
                return false;
              }

              var changeEvent = $scope.$emit('scrollify:change', {
                id: options.id,
                index: i,
                data: panes[i].$scope[valueIdentifier],
              });

              if (changeEvent.defaultPrevented) {
                return false;
              }

              currentPane = i;

              return true;
            };

            var getCurrentPane = function() {
              if (list.length === 1) {
                return 0;

              } else if (options.container === 'window') {
                return Math.round((list.length - 1) * ($window.scrollY / (dummy.scrollHeight - $window.innerHeight)));

              } else {
                return Math.round((list.length - 1) * (scrollifyEl.scrollTop / (dummy.scrollHeight - scrollifyEl.clientHeight)));
              }
            };

            var moveTimeout;

            var moveSlider = function(transitionDuration) {
              transitionDuration = transitionDuration || 0;

              // Kill previous transition (prevents skipping)
              slider.style[prefixedTransitionDuration] = '0ms';

              $timeout(function() {
                slider.style[prefixedTransitionDuration] = transitionDuration + 'ms';

                var sliderY = -(currentPane * wrapper.clientHeight);

                slider.style[prefixedTransform] = 'translate(0px, ' + sliderY + 'px)';

                $timeout.cancel(moveTimeout);

                moveTimeout = $timeout(function() {
                  $scope.$emit('scrollify:transitionEnd', {
                    id: defaults.id,
                    currentPane: currentPane,
                  });
                }, transitionDuration);
              });
            };

            var debounceScrollToCurrent = debounce(options.scrollSpeed, function() {
              preventScroll = false;
            });

            var calcRoot = function(x, factor) {
              factor = factor || 2;
              var y = Math.pow(Math.abs(x), 1 / factor);
              return x < 0 ? -y : y;
            };

            var scrollToCurrent = function(speed) {
              var distance = Math.max(1, Math.abs(prevPane - currentPane));

              speed = speed !== undefined ? speed : Math.round(Math.max(1, calcRoot(distance, options.scrollSpeedModifier))) * options.scrollSpeed;

              preventScroll = true;

              moveSlider(speed);

              debounceScrollToCurrent();

              if (!isTouch) {
                var scrollY;

                if (options.container === 'window') {
                  scrollY = ((dummy.scrollHeight - $window.innerHeight) / (list.length - 1)) * currentPane;

                  $window.scrollTo(0, scrollY);

                } else {
                  scrollY = ((dummy.scrollHeight - scrollifyEl.clientHeight) / (list.length - 1)) * currentPane;

                  scrollifyEl.scrollTop = scrollY;
                }

                if (!options.fixedPositon) {
                  container.style[prefixedTransform] = 'translate(0px, ' + Math.round(scrollY) + 'px)';
                }
              }
            };

            var setContainerHeight = function() {
              if (isTouch) {
                angular.element(dummy).css('display', 'none');
              }

              if (!isTouch) {
                angular.element(dummy).css('height', Math.max(200, (list.length * options.scrollBarModifier) * 100) + '%');
              }
            };

            var goTo = function(i, speed) {
              i = parseInt(i, 10);

              var _currentPane = currentPane;

              if (setCurrentPane(i)) {
                prevPane = _currentPane;

                scrollToCurrent(speed);
              }
            };

            var next = function(speed) {
              speed = speed !== undefined ? speed : options.scrollSpeed;

              goTo(currentPane < list.length - 1 ? currentPane + 1 : list.length - 1, speed);
            };

            var prev = function(speed) {
              speed = speed !== undefined ? speed : options.scrollSpeed;

              goTo(currentPane > 0 ? currentPane - 1 : currentPane, speed);
            };

            $scope.$scrollify = {
              goTo: goTo,
            };

            $scope.$on('scrollify:goTo', function(event, obj) {
              if (obj.id && options.id !== obj.id) {
                return false;
              }

              goTo(obj.pane, obj.speed);
            });

            $scope.$on('scrollify:next', function(event, obj) {
              if (obj && obj.id && options.id !== obj.id) {
                return false;
              }

              var speed = obj && obj.speed;

              next(speed);
            });

            $scope.$on('scrollify:prev', function(event, obj) {
              if (obj && obj.id && options.id !== obj.id) {
                return false;
              }

              var speed = obj && obj.speed;

              prev(speed);
            });

            $scope.$on('scrollify:scrollToCurrent', function(event, obj) {
              if (obj && obj.id && options.id !== obj.id) {
                return false;
              }

              var speed = obj && obj.speed;

              scrollToCurrent(speed || 0);
            });

            var deltaBuffer = [120, 120, 120];

            var isDivisible = function isDivisible(n, divisor) {
              return (Math.floor(n / divisor) === n / divisor);
            };

            var isTouchpad = function(deltaY) {
              if (!deltaY) {
                return;
              }
              deltaY = Math.abs(deltaY);
              deltaBuffer.push(deltaY);
              deltaBuffer.shift();
              var allDivisable = (isDivisible(deltaBuffer[0], 120) &&
                isDivisible(deltaBuffer[1], 120) &&
                isDivisible(deltaBuffer[2], 120));
              return !allDivisable;
            };

            var lethargy = new Lethargy();

            var wheelHandler = function(event) {
              event = event.originalEvent || event;

              if (!event.originalEvent) {
                event.originalEvent = event;
              }

              event.preventDefault();

              if (event.deltaY === -0) {
                return false;
              }

              var touchPad = isTouchpad(event.wheelDeltaY || event.wheelDelta || event.detail || 0);

              var deltaY;

              if (touchPad) {
                deltaY = lethargy.check(event);

              } else {
                deltaY = Hamster.normalise.delta(event)[2] > 0 ? 1 : -1;
              }

              if (deltaY !== false) {
                throttle(options.wheelThrottle, function() {
                  prevPane = currentPane;

                  var pane = currentPane - deltaY;

                  setCurrentPane(pane < 0 ? 0 : pane > list.length - 1 ? list.length - 1 : pane);

                  scrollToCurrent(options.scrollSpeed);
                });
              }
            };

            var debounceScroll = debounce(defaults.scrollDebounce, function() {
              if (prevPane === null) {
                prevPane = currentPane;
              }

              setCurrentPane(getCurrentPane());

              var distance = Math.max(1, Math.abs(prevPane - currentPane));

              var speed = Math.round(Math.max(1, calcRoot(distance, options.scrollSpeedModifier))) * options.scrollSpeed;

              moveSlider(speed);

              prevPane = null;
            });

            var scrollHandler = function(event) {
              var scrollY;

              if (options.container === 'window') {
                scrollY = $window.scrollY;

              } else {
                scrollY = scrollifyEl.scrollTop;
              }

              if (!options.fixedPositon) {
                container.style[prefixedTransform] = 'translate(0px, ' + scrollY + 'px)';
              }

              if (!preventScroll) {
                debounceScroll();
              }
            };

            var keyDownHandler = function(event) {
              if (event.keyCode === 40 || event.keyCode === 38) {
                event.preventDefault();

                if (event.keyCode === 40) {
                  next();
                }

                if (event.keyCode === 38) {
                  prev();
                }
              }

              if (event.keyCode === 9) {
                // Hack to force redraw after changing focus to off screen element
                wrapper.style.display = 'none';
                $timeout(function() {
                  wrapper.style.display = 'block';
                });
              }
            };

            var debounceResize = debounce(250, function() {
              preventScroll = false;
            });

            var resizeHandler = function() {
              preventScroll = true;

              debounceResize();

              setContainerHeight();

              scrollToCurrent(0);
            };

            var hammer;
            var preventPullRefresh = false;
            var lastTouchY = 0;
            var resizeEvent = 'onorientationchange' in $window ? 'orientationchange' : 'resize';

            var bindEvents = function() {
              if (isTouch && options.touchEnabled) {
                $document.on('touchstart', function(event) {
                  if (event.touches.length !== 1) {
                    return;
                  }
                  lastTouchY = event.touches[0].clientY;
                  if ($window.pageYOffset === 0) {
                    preventPullRefresh = true;
                  }
                });

                $document.on('touchmove', function(event) {
                  var touchY = event.touches[0].clientY;
                  var touchYDelta = touchY - lastTouchY;
                  lastTouchY = touchY;
                  if (preventPullRefresh) {
                    preventPullRefresh = false;
                    if (touchYDelta > 0) {
                      event.preventDefault();
                    }
                  }
                });

                hammer = new Hammer(scrollifyEl);

                hammer.get('swipe').set({
                  direction: Hammer.DIRECTION_ALL,
                });

                hammer.on('swipeup', function(event) {
                  next();
                });

                hammer.on('swipedown', function(event) {
                  prev();
                });
              }

              if (!isTouch) {
                $element.on('mousewheel', wheelHandler);
                $element.on('DOMMouseScroll', wheelHandler);

                if (options.container === 'window') {
                  angular.element($window).on('scroll', scrollHandler);

                } else {
                  $element.on('scroll', scrollHandler);
                }
              }

              $document.on('keydown', keyDownHandler);

              angular.element($window).on(resizeEvent, resizeHandler);
            };

            var unbindEvents = function() {
              angular.element($window).off(resizeEvent, resizeHandler);

              $element.off('mousewheel', wheelHandler);
              $element.off('DOMMouseScroll', wheelHandler);

              if (options.container === 'window') {
                angular.element($window).off('scroll', scrollHandler);

              } else {
                $element.off('scroll', scrollHandler);
              }

              $document.off('keydown', keyDownHandler);
            };

            $scope.$on('$destroy', function() {
              unbindEvents();
            });

            var init = function() {
              buildPanes();

              setContainerHeight();

              currentPane = options.startIndex !== false ? options.startIndex : getCurrentPane();

              $timeout(function() {
                $scope.$emit('scrollify:init', {
                  id: options.id,
                  currentPane: currentPane,
                });

                moveSlider(0);

                scrollToCurrent(0);

                bindEvents();
              }, options.initDelay);
            };

            $scope.$watch(listIdentifier, function(_list) {
              if (_list !== undefined) {
                list = _list;

                init();
              }
            });

          };
        },
      };
    },
  ]);

})();
