import _ from 'lodash';
import moment from 'moment';
import scriptjs from './libs/script.js';

export class GoogleCalendarDatasource {

  constructor(instanceSettings, $q, templateSrv) {
    this.type = instanceSettings.type;
    this.name = instanceSettings.name;
    this.clientId = instanceSettings.jsonData.clientId;
    this.scopes = 'https://www.googleapis.com/auth/calendar.readonly';
    this.discoveryDocs = ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"];
    this.q = $q;
    this.templateSrv = templateSrv;
    this.initialized = false;
  }

  load(onSuccess) {
    if (gapi.client) {
      return onSuccess();
    }
    gapi.load('client:auth2', function () {
      onSuccess();
    });
  }

  testDatasource() {
    var deferred = this.q.defer();
    var self = this;
    self.load(function () {
      gapi.client.init({
        clientId: self.clientId,
        scope: self.scopes,
        discoveryDocs: self.discoveryDocs
      }).then(function () {
        deferred.resolve({ status: 'success', message: 'Data source is working', title: 'Success' });
      }, function(err) {
        console.log(err);
        deferred.reject({ message: err.details });
      });
    });
    return deferred.promise;
  }

  initialize(onSuccess, onFail) {
    var self = this;
    if (self.initialized) {
      return onSuccess();
    }

    scriptjs('https://apis.google.com/js/api.js', function () {
      self.load(function () {
        gapi.client.init({
          clientId: self.clientId,
          scope: self.scopes,
          discoveryDocs: self.discoveryDocs
        }).then(function () {
          var isSignedIn = gapi.auth2.getAuthInstance().isSignedIn.get();
          if (!isSignedIn) {
            gapi.auth2.getAuthInstance().isSignedIn.listen(function (success) {
              if (success) {
                self.initialized = true;
                return onSuccess();
              } else {
                return onFail('failed to sign-in');
              }
            });
            gapi.auth2.getAuthInstance().signIn();
          } else {
            self.initialized = true;
            return onSuccess();
          }
        }, function (err) {
          console.log(err);
          return onFail('failed to init');
        });
      });
    });
  }

  annotationQuery(options) {
    var annotation = options.annotation;
    var calendarId = annotation.calendarId;
    var deferred = this.q.defer();

    if (_.isEmpty(calendarId)) {
      return deferred.resolve([]);
    }

    var self = this;
    self.initialize(function () {
      gapi.client.calendar.events.list({
        'calendarId': calendarId,
        'timeMin': options.range.from.toISOString(),
        'timeMax': options.range.to.toISOString(),
        'showDeleted': false,
        'singleEvents': true,
        'maxResults': 250,
        'orderBy': 'startTime'
      }).then(function (response) {
        var events = response.result.items;

        var result = _.chain(events)
          .map(function (event) {
            var start = moment(event.start.dateTime || event.start.date);
            var end = moment(event.end.dateTime || event.end.date);

            return [
              {
                annotation: annotation,
                time: start.valueOf(),
                title: event.summary,
                tags: ['start'],
                text: event.description
              },
              {
                annotation: annotation,
                time: end.valueOf(),
                title: event.summary,
                tags: ['end'],
                text: event.description
              }
            ];
          }).flatten().value();

        deferred.resolve(result);
      });
    }, function (err) {
      console.log(err);
      deferred.reject(err);
    });

    return deferred.promise;
  }
}
