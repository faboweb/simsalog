const fs = require(`fs`);
const { promisify } = require(`util`);
const { join, resolve } = require(`path`);
const exec = promisify(require(`child_process`).exec);
const inquirer = require(`inquirer`);

const changes = [];

// main function to inquire about the pending changes
const ask = async () => {
  const answer = await inquirer.prompt([
    {
      type: `list`,
      name: `type`,
      message: `What type of change do you want to add to the changelog?`,
      choices: [
        {
          name: `Addition of feature`,
          value: `Added`
        },
        {
          name: `Change of existing behavior`,
          value: `Changed`
        },
        {
          name: `Fix for a bug`,
          value: `Fixed`
        },
        {
          name: `Security improvement`,
          value: `Security`
        },
        {
          name: `Deprecation of unused code/feature`,
          value: `Deprecated`
        }
      ]
    },
    {
      type: `input`,
      name: `content`,
      message: `What is the content of the change?`,
      validate: function(value) {
        if (value) return true;

        return `You need to specify the change.`;
      }
    },
    {
      type: `list`,
      name: `referenceType`,
      message: `(mandatory) Which GitHub reference has this?`,
      choices: [
        {
          name: `Issue`,
          value: `issues`
        },
        {
          name: `Pull Request`,
          value: `pull`
        },
        {
          name: `(Avoid) None`,
          value: `none`
        }
      ]
    },
    {
      type: `input`,
      name: `referenceId`,
      message: `What is the id of the reference issue/PR on GitHub?`,
      validate: function(value) {
        if (value) return true;

        return `You need to specify the GitHub reference.`;
      },
      transformer(input) {
        return input.replace(`#`, ``);
      }
    },
    {
      type: `input`,
      name: `author`,
      message: `What is your GitHub handle?`,
      validate: function(value) {
        if (value) return true;

        return `You need to specify your GitHub handle.`;
      }
    },
    {
      type: `confirm`,
      name: `askAgain`,
      message: `Want to enter another change?`,
      default: false
    }
  ]);
  changes.push(answer);
  if (answer.askAgain) {
    await ask();
  }
};

async function logChanges(pendingChangesPath, commit) {
  // use branch name to avoid conflicts on changes entries
  let branch = ''
  try {
    branch = (await exec(`git rev-parse --abbrev-ref HEAD`)).stdout
      .trim()
      .replace(/\//g, `_`);
  } catch (err) {
    console.error("Couldn't get the branch name. Is this a .git repository (required)?")
    return
  }
  const changesFolderPath = resolve(pendingChangesPath);
  if (!fs.existsSync(changesFolderPath)) {
    fs.mkdirSync(changesFolderPath);
  }
  const changeFileName = join(changesFolderPath, branch);
  // if (fs.existsSync(changeFileName)) {
  //   fs.unlinkSync(changeFileName)
  // }

  if (fs.existsSync(changeFileName)) {
    const keep = await inquirer.prompt({
      type: `list`,
      name: `keep`,
      message: `Existing pending changes where found for your branch. How do you want to proceed?`,
      choices: [
        {
          name: `Append changes`,
          value: `append`
        },
        {
          name: `Delete old change`,
          value: `drop`
        }
      ]
    });
    if (keep === "drop") {
      fs.unlinkSync(changeFileName);
    }
  }
  await ask();

  const changelog = changes.reduce(
    (changelog, { type, content, author, referenceType, referenceId }) => {
      const referenceLink =
        referenceType === "none"
          ? ""
          : // eslint-disable-next-line no-useless-escape
            `[\#${referenceId}](https://github.com/cosmos/lunie/${referenceType}/${referenceId})`;
      changelog += `[${type}] ${referenceLink} ${content} @${author}\n`;
      return changelog;
    },
    ``
  );

  // write pending to file
  if (fs.existsSync(changeFileName)) {
    fs.appendFileSync(changeFileName, changelog.trim(), "utf8");
  } else {
    fs.writeFileSync(changeFileName, changelog.trim(), "utf8");
  }

  if (commit) {
    // commit changelog
    exec(`git add ${changeFileName}`);
    exec(`git commit -m 'changelog' ${changeFileName}`);
  }
}

module.exports = {
  logChanges
};
