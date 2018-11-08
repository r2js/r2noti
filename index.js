const _ = require('underscore');
const ObjectID = require('mongodb').ObjectID;
const modelNotification = require('./model/notification');
const modelUserNotification = require('./model/usernotification');
const log = require('debug')('r2:noti');

module.exports = function Noti(app, conf) {
  const getConf = conf || app.config('noti');
  if (!getConf) {
    return log('noti config not found!');
  }

  if (!app.hasServices('Mongoose|Plugin')) {
    return false;
  }

  const { userModel = 'profile' } = getConf;
  const mNotification = modelNotification(app, getConf);
  const mUserNotification = modelUserNotification(app, getConf);
  const mUser = app.service('Mongoose').model(userModel);
  const Apn = app.service('Apn');
  const Gcm = app.service('Gcm');

  return {
    save(data) {
      return mNotification.create(data);
    },

    findProfiles(
      { query = {}, batchSize = 1000, device = true } = {},
      batchHandler = (err, docs, next) => { next(); }
    ) {
      const options = { batchSize };
      if (device) {
        Object.assign(query, { device: { $exists: true } });
      }

      return mUser.findInBatches(query, options, (err, docs, next, count, docsRemaining) => {
        batchHandler(err, docs, next, count, docsRemaining);
      });
    },

    groupProfilesByDevice(profiles) {
      return Promise.resolve(_.groupBy(profiles, 'device'));
    },

    userNotificationsBulkInsert(notification, profiles) {
      const userNotification = profiles.map(profile => ({
        notification: ObjectID(notification.id),
        profile: ObjectID(profile.id),
        token: profile.deviceToken,
      }));

      return new Promise((resolve, reject) => {
        mUserNotification.collection.insert(userNotification, (err, docs) => (
          err ? reject(err) : resolve(docs)
        ));
      });
    },

    send(notification, groupedProfiles) {
      const promises = [];
      const { ios, android } = groupedProfiles;

      if (ios) {
        promises.push(this.sendNotification(Apn, notification, ios));
      }

      if (android) {
        promises.push(this.sendNotification(Gcm, notification, android));
      }

      if (!promises.length) {
        promises.push(Promise.resolve());
      }

      return Promise.all(promises);
    },

    sendNotification(service, notification, profiles) {
      let responseData;
      const { title, badge = 1, sound = 'default', data = {}, _id } = notification;
      Object.assign(data, { notId: _id });
      return service.send({
        message: title,
        payload: data,
        tokens: this.collectTokens(profiles),
        badge,
        sound,
      })
        .then((sendData) => {
          responseData = sendData;
          return this.updateUserNotifications(notification, sendData);
        })
        .then(() => responseData);
    },

    collectTokens(profiles) {
      return profiles.map(profile => profile.deviceToken);
    },

    updateUserNotifications(notification, { message = [] } = {}) {
      const promises = [];

      message.map((item) => {
        const { token, error } = item;
        promises.push(mUserNotification.update({
          notification: notification._id,
          token,
        }, error ?
          { serviceError: error.message || error, status: 'error' } :
          { status: 'success' }
        ));
        return item;
      });

      return Promise.all(promises);
    },

    saveTrigger(noti, batchSize = 1000) {
      let batches = 0;
      const q = { query: {}, batchSize };
      if (noti.participants && noti.participants.length) {
        Object.assign(q.query, { _id: { $in: noti.participants } });
      }

      return this.findProfiles(q, (err, profiles, next) => {
        batches += 1;
        return this.userNotificationsBulkInsert(noti, profiles)
          .then(() => this.groupProfilesByDevice(profiles))
          .then(data => this.send(noti, data))
          .then(() => next())
          .catch(() => next());
      })
        .then(() => Promise.resolve({ batches }));
    },
  };
};
