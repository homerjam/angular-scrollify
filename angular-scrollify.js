(function() {
    'use strict';

    var module = angular.module('hj.scrollify', []);

    module.constant('Hamster', Hamster);

    var throttle = function() {
        var last = +new Date();

        return function(fn, delay) {
            var now = +new Date();

            if (now - last >= delay) {
                last = now;
                fn();
            }
        };
    };

    module.factory('throttle', throttle);

    module.directive('hjScrollify', ['$window', '$document', '$timeout', '$log', 'throttle', 'Hamster',
        function($window, $document, $timeout, $log, throttle, Hamster) {
            return {
                restrict: 'A',
                transclude: true,
                template: '<div class="scrollify__dummy"></div><div class="scrollify__container"><div class="scrollify__wrapper"><div class="scrollify__pane" ng-transclude></div></div></div>',
                compile: function(_element, _attr, linker) {
                    return function link(scope, element, attr) {

                        var expression = attr.hjScrollify;
                        var match = expression.match(/^\s*(.+)\s+in\s+(.*?)\s*$/);
                        var valueIdentifier, listIdentifier;

                        if (!match) {
                            $log.error('Expected hjScrollify in form of "_item_ in _array_" but got "' + expression + '".');
                        }

                        valueIdentifier = match[1];
                        listIdentifier = match[2];

                        var options;

                        var defaults = {
                            container: 'window', // window/element - defines what to use for height measurements and scrolling
                            id: +new Date(), // `id` if using multiple instances
                            scrollSpeed: 200, // transition time to next pane (ms)
                            speedModifier: 3, // factor to divide `scrollSpeed` by when moving more than 1 pane
                            scrollBarModifier: 100, // length of container as a percentage of "real" length (prevents tiny handle on long pages)
                            wheelThrottle: 300, // throttle wheel/trackpad event
                            scrollMaxRate: 50, // debounce scroll event
                            startIndex: false, // optional start offset
                        };

                        if (attr.hjScrollifyOptions !== undefined) {
                            options = angular.extend(defaults, scope.$eval(attr.hjScrollifyOptions));
                        }

                        var getPrefix = function(prop) {
                            var prefixes = ['Moz', 'Khtml', 'Webkit', 'O', 'ms'],
                                elem = document.createElement('div'),
                                upper = prop.charAt(0).toUpperCase() + prop.slice(1);

                            if (prop in elem.style)
                                return prop;

                            for (var len = prefixes.length; len--;) {
                                if ((prefixes[len] + upper) in elem.style)
                                    return (prefixes[len] + upper);
                            }

                            return false;
                        };

                        var isTouch = ('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch;
                        var prefixedTransform = getPrefix('transform');
                        var prefixedTransitionDuration = getPrefix('transitionDuration');

                        var dummy = angular.element(element.children()[0]);
                        var container = angular.element(element.children()[1]);
                        var wrapper = container.children();

                        var templatePane = wrapper.children();
                        wrapper.children().remove();
                        wrapper.append('<!-- hjScrollify -->');

                        var _linker = function(pane) {
                            linker(pane.scope, function(clone) {
                                var paneClone = templatePane.clone();
                                paneClone.children().replaceWith(clone);
                                wrapper.append(paneClone);
                                pane.element = paneClone;
                            });
                        };

                        var list = [];

                        var panes = [];
                        var currentPane;
                        var prevPane = null;
                        var preventScroll = false;

                        var moveEndTimeout;
                        var scrollTimeout;
                        var resetTimeout;

                        var deltaCount = 0;
                        var jumpCount = 0;

                        var init = function() {
                            for (var i = 0; i < list.length; i++) {
                                var pane = {};
                                pane.scope = scope.$new();
                                pane.scope.$index = i;
                                panes.push(pane);

                                _linker(pane);

                                angular.element(pane.element).attr('data-index', i);
                            }

                            for (i = 0; i < list.length; i++) {
                                panes[i].scope[valueIdentifier] = list[i];

                                if (!panes[i].scope.$$phase) {
                                    panes[i].scope.$apply();
                                }
                            }

                            setContainerHeight();

                            $timeout(function() {
                                currentPane = options.startIndex !== false ? options.startIndex : getCurrentPane();

                                scope.$emit('scrollify:init', {
                                    id: options.id,
                                    currentPane: currentPane
                                });

                                moveWrapper(0);
                            });
                        };

                        scope.$watch(listIdentifier, function(_list) {
                            if (_list !== undefined) {
                                list = _list;

                                init();
                            }
                        });

                        new Hamster(element[0]).wheel(function(event, delta, deltaX, deltaY) {
                            event = event.originalEvent || event;

                            var normalisedDelta = normaliseDelta(event.detail, deltaY);

                            if (deltaY !== 0) {
                                preventScroll = true;

                                $timeout.cancel(resetTimeout);

                                resetTimeout = $timeout(function() {
                                    preventScroll = false;
                                }, options.scrollSpeed);

                                throttle(function() {
                                    deltaCount += normalisedDelta;

                                    if (Math.abs(0 - deltaCount) >= 1) {
                                        deltaCount = 0;

                                        jumpCount -= (deltaY > 0 ? 1 : -1);

                                        prevPane = currentPane;

                                        var pane = currentPane + jumpCount;

                                        setCurrentPane(pane < 0 ? 0 : pane > list.length - 1 ? list.length - 1 : pane);

                                        jumpCount = 0;

                                        scrollToCurrent();
                                    }
                                }, options.wheelThrottle);
                            }

                            event.preventDefault();
                        });

                        // http://stackoverflow.com/a/13650579/1050862
                        var normaliseDelta = function(detail, wheelDelta) {
                            var d = detail,
                                w = wheelDelta,
                                n = 225,
                                n1 = n - 1;

                            // Normalize delta
                            d = d ? w && (f = w / d) ? d / f : -d / 1.35 : w / 120;

                            // Quadratic scale if |d| > 1
                            d = d < 1 ? d < -1 ? (-Math.pow(d, 2) - n1) / n : d : (Math.pow(d, 2) + n1) / n;

                            // Delta *should* not be greater than 2...
                            return (Math.min(Math.max(d / 2, -1), 1)) * 240;
                        };

                        var setCurrentPane = function(i) {
                            var changeEvent = scope.$emit('scrollify:change', {
                                id: options.id,
                                index: i,
                                data: panes[i].scope[valueIdentifier],
                            });

                            if (changeEvent.defaultPrevented) {
                                return false;

                            } else {
                                currentPane = i;

                                return true;
                            }
                        };

                        var getCurrentPane = function() {
                            if (list.length === 1) {
                                return 0;

                            } else if (typeof options.container === 'string' && options.container.toLowerCase() === 'window') {
                                return Math.round((list.length - 1) * ($window.scrollY / (dummy[0].scrollHeight - $window.innerHeight)));

                            } else {
                                return Math.round((list.length - 1) * (element[0].scrollTop / (dummy[0].scrollHeight - element[0].clientHeight)));
                            }
                        };

                        var scrollToCurrent = function(speed) {
                            speed = speed !== undefined ? speed : Math.max(1, Math.abs(prevPane - currentPane) / options.speedModifier) * options.scrollSpeed;

                            if (typeof options.container === 'string' && options.container.toLowerCase() === 'window') {
                                $window.scrollTo(0, ((dummy[0].scrollHeight - $window.innerHeight) / (list.length - 1)) * currentPane);

                            } else {
                                element[0].scrollTop = ((dummy[0].scrollHeight - element[0].clientHeight) / (list.length - 1)) * currentPane;
                            }

                            moveWrapper(speed);
                        };

                        var setContainerHeight = function() {
                            dummy.css('height', (list.length * options.scrollBarModifier) + '%');
                        };

                        var moveWrapper = function(transitionDuration) {
                            transitionDuration = transitionDuration || 0;

                            var wrapperY = -(currentPane * container[0].clientHeight);

                            wrapper[0].style[prefixedTransform] = 'translate(0, ' + wrapperY + 'px)';
                            wrapper[0].style[prefixedTransitionDuration] = transitionDuration + 'ms';

                            $timeout.cancel(moveEndTimeout);

                            moveEndTimeout = $timeout(function() {
                                scope.$emit('scrollify:transitionEnd', {
                                    id: defaults.id,
                                    currentPane: currentPane
                                });
                            }, transitionDuration);
                        };

                        var scroll = function(event) {
                            $timeout.cancel(scrollTimeout);

                            if (!preventScroll) {
                                scrollTimeout = $timeout(function() {
                                    if (prevPane === null) {
                                        prevPane = currentPane;
                                    }

                                    setCurrentPane(getCurrentPane());

                                    moveWrapper(Math.max(1, Math.abs(prevPane - currentPane) / defaults.speedModifier) * defaults.scrollSpeed);

                                    prevPane = null;
                                }, defaults.scrollMaxRate);
                            }
                        };

                        var goTo = function(i, speed) {
                            if (setCurrentPane(i)) {
                                prevPane = currentPane;

                                scrollToCurrent(speed);
                            }
                        };

                        var next = function() {
                            goTo(currentPane < list.length - 1 ? currentPane + 1 : list.length - 1);
                        };

                        var prev = function() {
                            goTo(currentPane > 0 ? currentPane - 1 : currentPane);
                        };

                        scope.$on('scrollify:goTo', function(event, obj) {
                            if (obj.id && options.id !== obj.id) {
                                return false;
                            }

                            goTo(obj.pane, obj.speed);
                        });

                        scope.$on('scrollify:next', function(event, obj) {
                            if (obj.id && options.id !== obj.id) {
                                return false;
                            }

                            next();
                        });

                        scope.$on('scrollify:prev', function(event, obj) {
                            if (obj.id && options.id !== obj.id) {
                                return false;
                            }

                            prev();
                        });

                        var keyDown = function(event) {
                            switch (event.keyCode) {
                                case 40:
                                    next();
                                    event.preventDefault();
                                    break;
                                case 38:
                                    prev();
                                    event.preventDefault();
                                    break;
                            }
                        };

                        var resize = function(event) {
                            preventScroll = true;

                            $timeout.cancel(resetTimeout);

                            resetTimeout = $timeout(function() {
                                preventScroll = false;
                            }, options.scrollSpeed);

                            setContainerHeight();

                            scrollToCurrent(0);
                        };

                        var resizeEvent = 'onorientationchange' in $window ? 'orientationchange' : 'resize';

                        angular.element($window).on(resizeEvent, resize);

                        if (options.container === 'window') {
                            angular.element($window).on('scroll', scroll);
                        } else {
                            element.on('scroll', scroll);
                        }

                        $document.on('keydown', keyDown);

                        scope.$on('$destroy', function() {
                            angular.element($window).off(resizeEvent, resize);

                            if (options.container === 'window') {
                                angular.element($window).off('scroll', scroll);
                            } else {
                                element.off('scroll', scroll);
                            }

                            $document.off('keydown', keyDown);
                        });

                    };
                }
            };
        }
    ]);

})();
