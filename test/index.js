const chai = require('chai');
const r2base = require('r2base');
const r2mongoose = require('r2mongoose');
const r2query = require('r2query');
const r2plugin = require('r2plugin');
const r2system = require('r2system');
const r2apn = require('r2apn');
const r2gcm = require('r2gcm');
const r2noti = require('../index');
const sinon = require('sinon');
const apn = require('apn');
const gcm = require('node-gcm');
const testData = require('./data');

const { expect } = chai;
process.chdir(__dirname);

const app = r2base();
app.start()
  .serve(r2mongoose, { database: 'r2test' })
  .serve(r2query)
  .serve(r2plugin)
  .serve(r2system)
  .serve(r2apn, {})
  .serve(r2gcm, {})
  .load('model')
  .serve(r2noti, {})
  .into(app);

const Mongoose = app.service('Mongoose');
const notiService = app.service('Noti');
const mUserNotification = app.service('Mongoose').model('usernotification');

before((done) => {
  Mongoose.set('debug', false);
  Mongoose.connection.on('open', () => {
    testData(app)
      .then(() => done())
      .catch(() => done());
  });
});

function dropDatabase(done) {
  this.timeout(0);
  Mongoose.connection.db.dropDatabase();
  done();
}

after(dropDatabase);

describe('r2noti', () => {
  it('should save new notification', (done) => {
    notiService.save({ title: 'test notification', badge: 2, sound: 'mySound', data: { type: 'new-message', messageId: 1 } })
      .then((data) => {
        expect(data.title).to.equal('test notification');
        expect(data.isScheduled).to.equal(false);
        expect(data.participants.length).to.equal(0);
        expect(data.badge).to.equal(2);
        expect(data.sound).to.equal('mySound');
        expect(data.data).to.deep.equal({ messageId: 1, type: 'new-message' });
        done();
      })
      .catch(done);
  });

  it('should find profiles, device exists', (done) => {
    notiService.findProfiles({ batchSize: 2 }, (err, docs, next) => {
      expect(err).to.equal(null);
      expect(docs.length).to.equal(2);
      next();
    })
      .then(() => done())
      .catch(done);
  });

  it('should group profiles by device', (done) => {
    notiService.findProfiles({ batchSize: 6 }, (err, docs, next) => {
      notiService.groupProfilesByDevice(docs)
        .then((groupedProfiles) => {
          expect(groupedProfiles.ios.length).to.equal(3);
          expect(groupedProfiles.android.length).to.equal(3);
          next();
        });
    })
      .then(() => done())
      .catch(done);
  });

  it('should bulk insert user notifications', (done) => {
    let profiles;
    let notification;
    notiService.save({ title: 'test notification 2' })
      .then((data) => {
        notification = data;
        return notiService.findProfiles({ batchSize: 6 }, (err, docs, next) => {
          profiles = docs;
          next();
        });
      })
      .then(() => (
        notiService.userNotificationsBulkInsert(notification, profiles)
      ))
      .then((data) => {
        expect(data.result.ok).to.equal(1);
        expect(data.result.n).to.equal(6);
        expect(data.ops[0].notification.toString()).to.equal(notification.id);
        expect(data.ops[0].token).to.equal('ios1');
        done();
      })
      .catch(done);
  });

  let apnMethod;
  let gcmMethod;
  const fErr = new Error('Forced error');

  const sendApnOkMethod = () => (
    sinon.stub(apn.Provider.prototype, 'send').callsFake((message, _regIds) => (
      Promise.resolve({ sent: _regIds })
    ))
  );

  const sendApnFailureMethod = () => (
    sinon.stub(apn.Provider.prototype, 'send').callsFake((message, _regIds) => Promise.resolve({
      failed: _regIds.map(regId => ({
        device: regId,
        response: {
          reason: fErr.message,
        },
      })),
    }))
  );

  const sendGcmOkMethod = () => (
    sinon.stub(gcm.Sender.prototype, 'send').callsFake((message, recipients) => {
      return Promise.resolve({
        multicast_id: 'abc',
        success: recipients.registrationTokens.length,
        failure: 0,
        results: recipients.registrationTokens.map(token => ({
          message_id: '',
          registration_id: token,
          error: null,
        })),
      });
    })
  );

  const sendGcmFailureMethod = () => (
    sinon.stub(gcm.Sender.prototype, 'send').callsFake((message, recipients) => {
      const { registrationTokens } = recipients;
      return Promise.resolve({
        multicast_id: 'abc',
        success: 0,
        failure: registrationTokens.length,
        results: registrationTokens.map(token => ({
          message_id: '',
          registration_id: token,
          error: fErr.message,
        })),
      });
    })
  );

  describe('notifications, successful', () => {
    before(() => {
      apnMethod = sendApnOkMethod();
      gcmMethod = sendGcmOkMethod();
    });

    after(() => {
      apnMethod.restore();
      gcmMethod.restore();
    });

    it('should send notifications, successful', (done) => {
      let profiles;
      let groupedProfiles;
      let notification;
      notiService.save({ title: 'test notification 3' })
        .then((data) => {
          notification = data;
          return notiService.findProfiles({ batchSize: 6 }, (err, docs, next) => {
            profiles = docs;
            next();
          });
        })
        .then(() => (
          notiService.userNotificationsBulkInsert(notification, profiles)
        ))
        .then(() => notiService.groupProfilesByDevice(profiles))
        .then((data) => {
          groupedProfiles = data;
          return data;
        })
        .then(data => notiService.send(notification, data))
        .then((data) => {
          const [apnResult, gcmResult] = data;

          expect(apnResult.method).to.equal('apn');
          expect(apnResult.device).to.equal('ios');
          expect(apnResult.success).to.equal(3);
          expect(apnResult.failure).to.equal(0);
          expect(apnResult.message.length).to.equal(groupedProfiles.ios.length);

          expect(gcmResult.method).to.equal('gcm');
          expect(gcmResult.device).to.equal('android');
          expect(gcmResult.success).to.equal(3);
          expect(gcmResult.failure).to.equal(0);
          expect(gcmResult.message.length).to.equal(groupedProfiles.android.length);

          done();
        })
        .catch(done);
    });

    it('should send notifications via saveTrigger, successful', (done) => {
      notiService.save({
        title: 'test notification 101',
        badge: 3,
        sound: 'mySound2',
        data: { type: 'new-message', messageId: 2 },
      })
        .then(data => notiService.saveTrigger(data))
        .then((data) => {
          expect(data).to.deep.equal({ batches: 1 });
          done();
        })
        .catch(done);
    });
  });

  describe('notifications, failure', () => {
    before(() => {
      apnMethod = sendApnFailureMethod();
      gcmMethod = sendGcmFailureMethod();
    });

    after(() => {
      apnMethod.restore();
      gcmMethod.restore();
    });

    it('should send notifications, failure', (done) => {
      let profiles;
      let groupedProfiles;
      let notification;
      notiService.save({ title: 'test notification 4' })
        .then((data) => {
          notification = data;
          return notiService.findProfiles({ batchSize: 6 }, (err, docs, next) => {
            profiles = docs;
            next();
          });
        })
        .then(() => (
          notiService.userNotificationsBulkInsert(notification, profiles)
        ))
        .then(() => notiService.groupProfilesByDevice(profiles))
        .then((data) => {
          groupedProfiles = data;
          return data;
        })
        .then(data => notiService.send(notification, data))
        .then((data) => {
          const [apnResult, gcmResult] = data;

          expect(apnResult.method).to.equal('apn');
          expect(apnResult.device).to.equal('ios');
          expect(apnResult.success).to.equal(0);
          expect(apnResult.failure).to.equal(3);
          expect(apnResult.message.length).to.equal(groupedProfiles.ios.length);

          expect(gcmResult.method).to.equal('gcm');
          expect(gcmResult.device).to.equal('android');
          expect(gcmResult.success).to.equal(0);
          expect(gcmResult.failure).to.equal(3);
          expect(gcmResult.message.length).to.equal(groupedProfiles.android.length);

          done();
        })
        .catch(done);
    });
  });

  describe('user notifications', () => {
    it('should check user notifications by service error', (done) => {
      setTimeout(() => {
        mUserNotification.find({ serviceError: { $exists: true } }).exec()
          .then((data) => {
            expect(data.length).to.equal(6);
            done();
          })
          .catch(done);
      }, 50);
    });
  });

  describe('notification participants', () => {
    it('should send notifications via saveTrigger and participants, successful', (done) => {
      notiService.save({
        title: 'test notification 102',
        participants: [global['user-test2']._id, global['user-test3']._id],
        badge: 3,
        sound: 'mySound2',
        data: { type: 'new-message', messageId: 2 },
      })
        .then(data => notiService.saveTrigger(data, 1))
        .then((data) => {
          expect(data).to.deep.equal({ batches: 2 });
          done();
        })
        .catch(done);
    });
  });
});
