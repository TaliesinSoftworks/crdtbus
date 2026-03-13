import { createSuite } from "@benchristel/taste";
export { expect, is, equals, which } from "@benchristel/taste";
export const integrationSuite = createSuite();
export const integrationTest = integrationSuite.test;
