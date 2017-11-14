module.exports = (app, getConf) => {
  const Plugin = app.service('Plugin');
  const mongoose = app.service('Mongoose');
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

  Plugin.plugins(schema);

  // { owner, attributes, rules, adminSearch, apiSearch }
  schema.r2options = app.service('model/_options/usernotification') || {};

  return mongoose.model('usernotification', schema);
};
