(function() {
    'use strict';

    angular.module('angular-scrollify', []).directive('ngScrollify', ['$log', '$window', '$document', '$timeout',
        function($log, $window, $document, $timeout) {
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
                            scrollBarMod: 50,
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

                        var panes = [];

                        for (var i = 0; i < scope[listIdentifier].length; i++) {
                            var pane = {};
                            pane.scope = scope.$new();
                            panes.push(pane);

                            _linker(pane);

                            angular.element(pane.element).attr('data-index', i);
                        }

                        for (i = 0; i < scope[listIdentifier].length; i++) {
                            panes[i].scope[valueIdentifier] = scope[listIdentifier][i];

                            if (!panes[i].scope.$$phase) {
                                panes[i].scope.$apply();
                            }
                        }

                        var scrollSpeed = 0;
                        var preventScroll = false;

                        var currentPane = 0;

                        var hamster = new Hamster(element[0]).wheel(function(e, delta, deltaX, deltaY) {
                            currentPane -= deltaY;

                            currentPane = currentPane < 0 ? 0 : currentPane;
                            currentPane = currentPane > scope[listIdentifier].length - 1 ? scope[listIdentifier].length - 1 : currentPane;

                            scrollToCurrent();

                            e.preventDefault();
                        });

                        var scrollToCurrent = function() {
                            $window.scrollTo(0, (($document[0].documentElement.scrollHeight - $window.innerHeight) / (scope[listIdentifier].length - 1)) * currentPane);
                        };

                        var setContainerHeight = function() {
                            _element.css('height', (scope[listIdentifier].length * defaults.scrollBarMod) + '%');
                        };

                        setContainerHeight();

                        var wrapperY = 0;

                        var moveWrapper = function(transDuration) {
                            transDuration = transDuration || 0;
                            wrapperY = -(currentPane * container[0].clientHeight);
                            wrapper[0].style[Modernizr.prefixed('transform')] = 'translate(0, ' + wrapperY + 'px)';
                            wrapper[0].style[Modernizr.prefixed('transitionDuration')] = transDuration + 'ms';
                        };

                        function scroll(e) {
                            if (!preventScroll) {
                                currentPane = Math.round((scope[listIdentifier].length - 1) * ($window.scrollY / ($document[0].documentElement.scrollHeight - $window.innerHeight)));

                                moveWrapper(scrollSpeed);
                            }
                        }

                        function keyDown(e) {
                            switch (e.keyCode) {
                                case 40:
                                    currentPane = currentPane < scope[listIdentifier].length - 1 ? currentPane + 1 : scope[listIdentifier].length - 1;
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
                            }, scrollSpeed);
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

                        $timeout(function() {
                            scrollSpeed = defaults.scrollSpeed;
                        }, defaults.scrollSpeed);

                    };
                }
            };
        }
    ]);

})();
