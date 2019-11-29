module.exports = (app, getConf) => {
  const Plugin = app.service('Plugin');
  const mongoose = app.service('Mongoose');
  const { Validate } = app.service('System');
  const { Schema } = mongoose;
  const { ObjectId, Mixed } = mongoose.Schema.Types;
  const { userModel, tokenBatch = 1000 } = getConf;

  const schema = Schema({
    profile: { type: ObjectId, ref: userModel, index: true },
    title: { type: String, required: true },
    body: { type: String },
    participants: [{ type: ObjectId, ref: userModel }],
    isScheduled: { type: Boolean, default: false },
    scheduleStatus: { type: String, enum: ['waiting', 'finished'] },
    activatedAt: { type: Date },
    badge: { type: Number, default: 0 },
    sound: { type: String },
    data: { type: Mixed },
  }, {
    timestamps: true,
  });

  schema.virtual('hookDisabled').set(function (value) {
    this._hookDisabled = value || false;
  });

  schema.pre('save', function (next) {
    this.wasNew = this.isNew;

    const hookService = app.service('NotificationHook');
    if (hookService && hookService.preSave) {
      hookService.preSave(this);
    }

    next();
  });

  schema.post('save', function (noti) {
    if (this.wasNew && !this._hookDisabled) {
      app.service('Noti').saveTrigger(noti, tokenBatch);
    }

    const hookService = app.service('NotificationHook');
    if (hookService && hookService.postSave) {
      hookService.postSave(this, noti);
    }
  });

  Plugin.plugins(schema);

  schema.r2options = app.service('model/_options/notification') || {};
  const { attributes, rules } = schema.r2options;
  Validate(schema, { attributes, rules });

  return mongoose.model('notification', schema);
};
