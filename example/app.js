angular.module('ExampleCtrl', []).controller('ExampleCtrl', ['$scope',
    function($scope) {

        $scope.panes = [];

        for (var i = 0; i < 50; i++) {

            $scope.panes[i] = {
                index: i + 1,
                color: '#' + ('000000' + Math.floor(Math.random() * 16777215).toString(16)).slice(-6)
            };

        }

    }
]);

angular.module('ExampleApp', ['angular-scrollify', 'ExampleCtrl']).config(function() {});
