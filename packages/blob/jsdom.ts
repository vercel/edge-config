// the jest jsdom does not include the fetch API
// https://github.com/jsdom/jsdom/issues/1724

import JSDOMEnvironment from 'jest-environment-jsdom';

export default class JSDOMEnvWithFetch extends JSDOMEnvironment {
  constructor(...args: ConstructorParameters<typeof JSDOMEnvironment>) {
    super(...args);

    this.global.fetch = fetch;
    this.global.Headers = Headers;
    this.global.Request = Request;
    this.global.Response = Response;
  }
}
