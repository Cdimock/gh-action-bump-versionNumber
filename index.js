// test
const { execSync, spawn, exec } = require('child_process');
const { existsSync } = require('fs');
const { EOL } = require('os');
const path = require('path');

// Change working directory if user defined PACKAGEJSON_DIR
if (process.env.PACKAGEJSON_DIR) {
  process.env.GITHUB_WORKSPACE = `${process.env.GITHUB_WORKSPACE}/${process.env.PACKAGEJSON_DIR}`;
  process.chdir(process.env.GITHUB_WORKSPACE);
}

const workspace = process.env.GITHUB_WORKSPACE;

(async () => {
  const pkg = getPackageJson();
  const commitMessage = process.env['INPUT_COMMIT-MESSAGE'] || 'CI: Version Number bumped to {{versionNumber}}';

  // GIT logic
  try {
    const currentVersionNumber = pkg.version.toString();
    
    // set git user
    await runInWorkspace('git', ['config', 'user.name', `"${process.env.GITHUB_USER || 'Automated Version Bump'}"`]);
    await runInWorkspace('git', [
      'config',
      'user.email',
      `"${process.env.GITHUB_EMAIL || 'gh-action-bump-versionNumber@users.noreply.github.com'}"`,
    ]);

    let releaseTag = '';
    // let isPullRequest = false;

    // if (process.env.GITHUB_HEAD_REF) {
    //   // Comes from a pull request
    //   releaseTag = process.env.GITHUB_HEAD_REF;
    //   isPullRequest = true;
    // } else {
      releaseTag = /refs\/[a-zA-Z]+\/(.*)/.exec(process.env.GITHUB_REF)[1];
    // }

    // if (process.env['INPUT_TARGET-BRANCH']) {
      // We want to override the branch that we are pulling / pushing to
      targetBranch = process.env['INPUT_TARGET-BRANCH'];
    // }
    console.log('Target Branch: ', targetBranch);
    console.log('Release Tag:', releaseTag);
    console.log('Version Number in package.json from release tag:', currentVersionNumber);
    // do it in the current checked out github branch (DETACHED HEAD)
    // important for further usage of the package.json version

    // Fetch all tags
    // await runInWorkspace('git', ['fetch', '--all', '--tags']);

    // const latestTag = (await execSync(`git tag -l --sort=-version:refname "`+tagPrefix+`[0-9]*"|head -n 1`)).toString();

    // let lastBuildNumber = currentBuildNumber;
    // if(latestTag === ''){
    //   console.log(`No tags found matching tag prefix [${tagPrefix}], using build number currently in package.json [${lastBuildNumber}] as lastBuildNumber`);
    // } else {
    //   console.log(`Found latest tag: ${latestTag}`);
    //   lastBuildNumber = latestTag.split("/")[1].trim();
    // }

    const majorVersion = currentVersionNumber.toString().split(".")[0];
    const minorVersion = currentVersionNumber.toString().split(".")[1];
    const lastPatchNumber = currentVersionNumber.toString().split(".")[2];
    console.log("Last Patch Number: ", lastPatchNumber);

    const nextPatchNumber = parseInt(lastPatchNumber) + 1;
    
    const nextVersionNumber = `${majorVersion}.${minorVersion}.${nextPatchNumber}`;


    console.log(`Last Version Number ${currentVersionNumber}`);
    console.log(`Next Version Number ${nextVersionNumber}`);

    // now go to the actual branch to perform the same versioning
    // if (isPullRequest) {
    //   // First fetch to get updated local version of branch
    //   await runInWorkspace('git', ['fetch']);
    // }
    console.log("Checking out ", targetBranch);
    await runInWorkspace('git', ['checkout', targetBranch]);

    console.log("Creating branch ", `bump-to-v${nextVersionNumber}`);
    await runInWorkspace('git', ['checkout', '-b', `bump-to-v${nextVersionNumber}`]);
    
    //update build Number here
    console.log("Updating version number....");
    updateVersionNumber(nextVersionNumber);
    
    console.log('version in package.json', getPackageJson().version);
    try {
      // to support "actions/checkout@v1"
      await runInWorkspace('git', ['commit', '-a', '-m', commitMessage.replace(/{{buildNumber}}/g, nextVersionNumber)]);
      
    } catch (e) {
      console.warn(
        'git commit failed because you are using "actions/checkout@v2"; ' +
          'but that doesnt matter because you dont need that git commit, thats only for "actions/checkout@v1"',
      );
    }

    const remoteRepo = `https://${process.env.GITHUB_ACTOR}:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`;

    console.log("pushing to branch origin....");
    await runInWorkspace('git', ['push', 'origin']);
    // await runInWorkspace('git', ['push', remoteRepo, '--follow-tags']);
    // await runInWorkspace('git', ['push', remoteRepo, '--tags']);

   
  } catch (e) {
    logError(e);
    exitFailure('Failed to bump version');
    return;
  }
  exitSuccess('Version bumped!');
})();

function updateVersionNumber(versionNumber) {
  const fs = require('fs');
  const fileName = getPackageJson();
  const file = require(fileName);
      
  file.version = `${versionNumber}`;
      
  fs.writeFile(fileName, JSON.stringify(file, null, 2), function writeJSON(err) {
    if (err) return exitFailure(err);
  });
}

function getPackageJson() {
  const pathToPackage = path.join(workspace, 'package.json');
  if (!existsSync(pathToPackage)) throw new Error("package.json could not be found in your project's root.");
  return require(pathToPackage);
}

function exitSuccess(message) {
  console.info(`✔  success   ${message}`);
  process.exit(0);
}

function exitFailure(message) {
  logError(message);
  process.exit(1);
}

function logError(error) {
  console.error(`✖  fatal     ${error.stack || error}`);
}

function runInWorkspace(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: workspace });
    let isDone = false;
    const errorMessages = [];
    child.on('error', (error) => {
      if (!isDone) {
        isDone = true;
        reject(error);
      }
    });
    child.stderr.on('data', (chunk) => errorMessages.push(chunk));
    child.on('exit', (code) => {
      if (!isDone) {
        if (code === 0) {
          resolve();
        } else {
          reject(`${errorMessages.join('')}${EOL}${command} exited with code ${code}`);
        }
      }
    });
  });
  //return execa(command, args, { cwd: workspace });
}
