import { $ } from "bun";
import chalk from "chalk";

const formattedDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const imageTag = `${process.env.REGISTRY_HOST}/schedule-codex:${formattedDate}`;

const buildCommand = `docker build -t ${imageTag} -f docker/dockerfile .`;
const pushCommand = `docker push ${imageTag}`;

const buildArray = buildCommand.split(" ");
const pushArray = pushCommand.split(" ");

try {
  // Build the image
  console.log(chalk.green(`$`), buildCommand);
  for await (let line of $`${buildArray}`.lines()) {
    console.log(chalk.gray(line));
  }
  // Push the image to the registry
  console.log(chalk.green(`$`), pushCommand);
  for await (let line of $`${pushArray}`.lines()) {
    console.log(chalk.gray(line));
  }
} catch (error) {
  console.error(error);
}
