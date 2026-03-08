import fs from "fs-extra";
import path from "path";
import { execSync } from "child_process";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";

const ROOT_DIR = path.resolve(process.cwd());
const DASHBOARD_ENV_PATH = path.join(ROOT_DIR, "dashboard", ".env");
const VISHNU_CRED_DIR = path.join(ROOT_DIR, ".vishnu", "credentials");

async function main() {
  console.log(chalk.cyan.bold("\n🌌 Graviton Systems — Firebase Credential Engine\n"));

  // 1. Detect Projects
  const firebasercPath = path.join(ROOT_DIR, ".firebaserc");
  if (!fs.existsSync(firebasercPath)) {
    console.log(chalk.red("❌ No .firebaserc found. Please run 'firebase init' first."));
    process.exit(1);
  }

  const firebaserc = fs.readJSONSync(firebasercPath);
  const projects = Object.keys(firebaserc.projects || {}).map(alias => ({
    name: `${alias} (${firebaserc.projects[alias]})`,
    value: firebaserc.projects[alias],
    alias
  }));

  if (projects.length === 0) {
    console.log(chalk.red("❌ No projects found in .firebaserc."));
    process.exit(1);
  }

  const { selectedProject } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedProject",
      message: "Select Firebase project to configure:",
      choices: projects
    }
  ]);

  const projectId = selectedProject;
  console.log(chalk.blue(`\nSwitching to project: ${projectId}...`));
  execSync(`npx firebase use ${projectId}`, { stdio: "inherit" });

  // 2. Fetch Client SDK Config
  const spinner = ora("Fetching Web SDK Config from Firebase...").start();
  let clientConfigStr = "";
  try {
    // Attempt to parse SDK config
    const output = execSync(`npx firebase apps:sdkconfig web --json`, { encoding: "utf8" });
    const jsonOutput = JSON.parse(output);
    if (jsonOutput.status === "success" && jsonOutput.result?.sdkConfig) {
      clientConfigStr = JSON.stringify(jsonOutput.result.sdkConfig, null, 2);
      spinner.succeed("Fetched Web SDK Config.");
    } else {
      throw new Error("No sdkConfig in output");
    }
  } catch (error) {
    spinner.warn("Could not auto-fetch Web SDK config. Ensure you have a Web App registered in Firebase.");
    console.log(chalk.yellow("Retrieving configuration manually..."));
    
    const { manualConfig } = await inquirer.prompt([
      {
        type: "editor",
        name: "manualConfig",
        message: "Please paste your Firebase Web SDK config JSON object:"
      }
    ]);
    clientConfigStr = manualConfig;
  }

  let clientConfig;
  try {
    clientConfig = typeof clientConfigStr === 'string' ? JSON.parse(clientConfigStr) : clientConfigStr;
  } catch (error) {
    console.log(chalk.red("❌ Invalid JSON for client config."));
    process.exit(1);
  }

  // 3. Obtain Admin SDK
  console.log("");
  const { adminKeyPath } = await inquirer.prompt([
    {
      type: "input",
      name: "adminKeyPath",
      message: "Enter the path to your downloaded Service Account JSON key (e.g., ~/Downloads/key.json):",
      validate: (input) => fs.existsSync(input) ? true : "File does not exist."
    }
  ]);

  const adminSdkJson = fs.readJSONSync(adminKeyPath);

  // 4. Secure Storage (.vishnu/)
  const projectCredDir = path.join(VISHNU_CRED_DIR, projectId);
  fs.ensureDirSync(projectCredDir);

  const secureAdminPath = path.join(projectCredDir, "admin-sdk.json");
  const secureClientPath = path.join(projectCredDir, "firebase-sdk.json");

  fs.writeJSONSync(secureAdminPath, adminSdkJson, { spaces: 2 });
  fs.writeJSONSync(secureClientPath, clientConfig, { spaces: 2 });
  console.log(chalk.green(`\n✅ Secured credentials in .vishnu/credentials/${projectId}/`));

  // 5. Inject into dashboard/.env
  ora("Injecting credentials into dashboard/.env...").start().succeed();

  let envContent = fs.existsSync(DASHBOARD_ENV_PATH) ? fs.readFileSync(DASHBOARD_ENV_PATH, "utf8") : "";

  // Helper to update or append env var
  const updateEnv = (key: string, value: string) => {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  };

  // Client Env
  updateEnv("NEXT_PUBLIC_FIREBASE_API_KEY", clientConfig.apiKey || "");
  updateEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", clientConfig.authDomain || "");
  updateEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", clientConfig.projectId || "");
  updateEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", clientConfig.storageBucket || "");
  updateEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", clientConfig.messagingSenderId || "");
  updateEnv("NEXT_PUBLIC_FIREBASE_APP_ID", clientConfig.appId || "");

  // Admin Env
  updateEnv("FIREBASE_PROJECT_ID", adminSdkJson.project_id || "");
  updateEnv("FIREBASE_CLIENT_EMAIL", adminSdkJson.client_email || "");
  
  // Clean format the private key to be a single inline string for .env
  const privateKey = adminSdkJson.private_key ? adminSdkJson.private_key.replace(/\n/g, "\\n") : "";
  updateEnv("FIREBASE_PRIVATE_KEY", `"${privateKey}"`);

  // Trim leading/trailing newlines
  envContent = envContent.replace(/^\n+/, "").replace(/\n+$/, "") + "\n";
  
  fs.writeFileSync(DASHBOARD_ENV_PATH, envContent);
  console.log(chalk.green(`✅ Updated ${DASHBOARD_ENV_PATH}`));

  // 6. Ensure .gitignore protections
  const gitignorePath = path.join(ROOT_DIR, ".gitignore");
  let gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf8") : "";
  if (!gitignore.includes(".vishnu/")) {
    gitignore += "\n\n# Secure Vishnu Credentials\n.vishnu/\n";
    fs.writeFileSync(gitignorePath, gitignore);
    console.log(chalk.green("✅ Added .vishnu/ to .gitignore"));
  }

  console.log(chalk.cyan.bold("\n🚀 Credential Engine completed successfully!\n"));
}

main().catch(error => {
  console.error(chalk.red("Fatal error:"), error);
  process.exit(1);
});
