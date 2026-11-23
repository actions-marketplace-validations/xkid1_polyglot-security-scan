// GitHub Action entry point (bundled into dist/index.js, see action.yml).
import * as core from '@actions/core';

import { run } from '@apps';
import { errorMessage } from '@utils';

run().catch((error: unknown) => {
  core.setFailed(errorMessage(error));
});
