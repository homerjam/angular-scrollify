(function() {
    'use strict';

    angular.module('angular-throttle', [])
        .factory('throttle', [
            function() {
                var last = +new Date();

                return function(fn, delay) {
                    var now = +new Date();

                    if (now - last >= delay) {
                        last = now;
                        fn();
                    }
                };
            }
        ]);

    angular.module('angular-scrollify', ['angular-throttle']).directive('ngScrollify', ['$log', '$window', '$document', '$timeout', 'throttle',
        function($log, $window, $document, $timeout, throttle) {
            return {
                restrict: 'A',
                transclude: true,
                template: '<div class="scrollify-container">' + '<div class="scrollify-wrapper">' + '<div class="scrollify-pane" ng-transclude></div>' + '</div>' + '</div>',
                compile: function(_element, _attr, linker) {
                    return function link(scope, element, attr) {

                        var expression = attr.ngScrollify;
                        var match = expression.match(/^\s*(.+)\s+in\s+(.*?)\s*$/);
                        var valueIdentifier, listIdentifier;

                        if (!match) {
                            $log.error('Expected ngScrollify in form of "_item_ in _array_" but got "' + expression + '".');
                        }

                        valueIdentifier = match[1];
                        listIdentifier = match[2];

                        var defaults = {
                            scrollSpeed: 200,
                            scrollBarMod: 100,
                            wheelMaxRate: 20,
                            scrollMaxRate: 50
                        };

                        if (attr.ngCarouselOptions !== undefined) {
                            angular.extend(defaults, scope.$eval(attr.ngCarouselOptions));
                        }

                        var container = element.children();
                        var wrapper = container.children();

                        var templatePane = wrapper.children();
                        wrapper.children().remove();
                        wrapper.append('<!-- ngScrollify -->');

                        function _linker(pane) {
                            linker(pane.scope, function(clone) {
                                var paneClone = templatePane.clone();
                                paneClone.children().replaceWith(clone);
                                wrapper.append(paneClone);
                                pane.element = paneClone;
                            });
                        }

                        var panes = [],
                            preventScroll = false,
                            currentPane = 0,
                            prevPane = false;

                        var init = function() {
                            for (var i = 0; i < list.length; i++) {
                                var pane = {};
                                pane.scope = scope.$new();
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

                            setCurrentPane();

                            moveWrapper(0);
                        };

                        var list = [];

                        scope.$watch(listIdentifier, function(n) {
                            if (n !== undefined) {
                                list = n;

                                init();
                            }
                        });

                        var wheelTimeout,
                            deltaCount = 0,
                            jumpCount = 0;

                        var hamster = new Hamster(element[0]).wheel(function(e, delta, deltaX, deltaY) {
                            var normalisedDelta = normaliseDelta(e.detail, e.wheelDelta);

                            if (deltaY !== 0) {
                                deltaCount += normalisedDelta;

                                if (Math.abs(0 - deltaCount) >= 1) {
                                    deltaCount = 0;

                                    jumpCount -= (deltaY > 0 ? 1 : -1);

                                    $timeout.cancel(wheelTimeout);
                                    wheelTimeout = $timeout(function() {
                                        prevPane = currentPane;

                                        currentPane += jumpCount;

                                        jumpCount = 0;

                                        scrollToCurrent();
                                    }, defaults.wheelMaxRate);
                                }
                            }

                            e.preventDefault();
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
                            return (Math.min(Math.max(d / 2, -1), 1)) * 2;
                        };

                        var setCurrentPane = function() {
                            currentPane = Math.round((list.length - 1) * ($window.scrollY / ($document[0].documentElement.scrollHeight - $window.innerHeight)));
                        };

                        var scrollToCurrent = function() {
                            $window.scrollTo(0, (($document[0].documentElement.scrollHeight - $window.innerHeight) / (list.length - 1)) * currentPane);
                        };

                        var setContainerHeight = function() {
                            _element.css('height', (list.length * defaults.scrollBarMod) + '%');
                        };

                        var moveWrapper = function(transDuration) {
                            transDuration = transDuration || 0;
                            var wrapperY = -(currentPane * container[0].clientHeight);
                            wrapper[0].style[Modernizr.prefixed('transform')] = 'translate(0, ' + wrapperY + 'px)';
                            wrapper[0].style[Modernizr.prefixed('transitionDuration')] = transDuration + 'ms';
                        };

                        var scrollTimeout;

                        function scroll(e) {
                            $timeout.cancel(scrollTimeout);

                            if (!preventScroll) {
                                scrollTimeout = $timeout(function() {
                                    if (prevPane === false) {
                                        prevPane = currentPane;
                                    }

                                    setCurrentPane();

                                    moveWrapper(Math.max(1, Math.abs(prevPane - currentPane)) * defaults.scrollSpeed);

                                    prevPane = false;
                                }, defaults.scrollMaxRate);
                            }
                        }

                        function keyDown(e) {
                            switch (e.keyCode) {
                                case 40:
                                    currentPane = currentPane < list.length - 1 ? currentPane + 1 : list.length - 1;
                                    scrollToCurrent();
                                    e.preventDefault();
                                    break;
                                case 38:
                                    currentPane = currentPane > 0 ? currentPane - 1 : currentPane;
                                    scrollToCurrent();
                                    e.preventDefault();
                                    break;
                            }
                        }

                        var resetTimeout;

                        var resize = function(e) {
                            preventScroll = true;

                            setContainerHeight();

                            scrollToCurrent();

                            moveWrapper(0);

                            $timeout.cancel(resetTimeout);
                            resetTimeout = $timeout(function() {
                                preventScroll = false;
                            }, defaults.scrollSpeed);
                        };

                        var resizeEvent = 'onorientationchange' in $window ? 'orientationchange' : 'resize';

                        angular.element($window).on(resizeEvent, resize);
                        angular.element($window).on('scroll', scroll);
                        $document.on('keydown', keyDown);

                        scope.$on('$destroy', function() {
                            angular.element($window).off(resizeEvent, resize);
                            angular.element($window).off('scroll', scroll);
                            $document.off('keydown', keyDown);
                        });

                    };
                }
            };
        }
    ]);

})();