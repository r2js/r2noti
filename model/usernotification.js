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

  schema.post('save', function (noti) {
    const hookService = app.service('UserNotificationHook');
    if (hookService && hookService.postSave) {
      hookService.postSave(this, noti);
    }
  });

  Plugin.plugins(schema);

  schema.r2options = app.service('model/_options/usernotification') || {};
  const { attributes, rules } = schema.r2options;
  Validate(schema, { attributes, rules });

  return mongoose.model('usernotification', schema);
};
