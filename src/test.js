import {
  getAllTests,
  runTests,
  formatTestResultsAsText,
} from "@benchristel/taste";
import { integrationSuite } from "./integrationTest";
import "./Bus";
(async () => {
  const results = await runTests(getAllTests());
  const testOutput = formatTestResultsAsText(results);

  console.log(testOutput);

  const integrationResults = await runTests(integrationSuite.getAllTests());
  const integrationTestOutput = formatTestResultsAsText(integrationResults);

  console.log(integrationTestOutput);
})();
