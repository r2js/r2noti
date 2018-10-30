module.exports = (app, getConf) => {
  const Plugin = app.service('Plugin');
  const mongoose = app.service('Mongoose');
  const { Validate } = app.service('System');
  const { Schema } = mongoose;
  const { ObjectId, Mixed } = mongoose.Schema.Types;
  const { userModel } = getConf;

  const schema = Schema({
    notification: { type: ObjectId, ref: 'notification', required: true },
    profile: { type: ObjectId, ref: userModel, required: true },
    token: { type: String },
    activatedAt: { type: Date },
    serviceError: { type: Mixed },
    status: { type: String },
  }, {
    timestamps: true,
  });

  schema.pre('save', function (next) {
    this.wasNew = this.isNew;

    const hookService = app.service('UserNotificationHook');
    if (hookService && hookService.preSave) {
      hookService.preSave(this);
    }

    next();
  });

  schema.post('update', function (noti) {
    const hookService = app.service('UserNotificationHook');
    if (hookService && hookService.postUpdate) {
      hookService.postUpdate(this, noti);
    }
  });

  schema.post('remove', function (noti) {
    const hookService = app.service('UserNotificationHook');
    if (hookService && hookService.postRemove) {
      hookService.postRemove(noti);
    }
  });

  Plugin.plugins(schema);

  schema.r2options = app.service('model/_options/usernotification') || {};
  const { attributes, rules } = schema.r2options;
  Validate(schema, { attributes, rules });

  return mongoose.model('usernotification', schema);
};
