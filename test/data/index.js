const userData = {
  passwd: 12345,
  isEnabled: true,
  isVerified: true,
};

module.exports = (app) => {
  const mProfile = app.service('model/profile');

  const createUser = ({ email, name, slug, device, deviceToken } = {}) => (
    mProfile.findOrCreate(
      { email }, Object.assign(userData, { email, name, device, deviceToken })
    )
      .then((data) => {
        const user = data.doc;
        global[`user-${slug}`] = user;
      })
      .catch(console.log)
  );

  return new Promise((resolve) => {
    createUser({ email: 'test1@r2js.org', name: 'Test1', slug: 'test1', device: 'ios', deviceToken: 'ios1' })
      .then(() => createUser({ email: 'test2@r2js.org', name: 'Test2', slug: 'test2', device: 'ios', deviceToken: 'ios2' }))
      .then(() => createUser({ email: 'test3@r2js.org', name: 'Test3', slug: 'test3', device: 'ios', deviceToken: 'ios3' }))
      .then(() => createUser({ email: 'test4@r2js.org', name: 'Test4', slug: 'test4', device: 'android', deviceToken: 'android1' }))
      .then(() => createUser({ email: 'test5@r2js.org', name: 'Test5', slug: 'test5', device: 'android', deviceToken: 'android2' }))
      .then(() => createUser({ email: 'test6@r2js.org', name: 'Test6', slug: 'test6', device: 'android', deviceToken: 'android3' }))
      .then(resolve)
      .catch(resolve);
  });
};
