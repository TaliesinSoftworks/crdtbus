export async function waitForMilliseconds(millis: number) {
  await new Promise<void>((resolve) => setTimeout(() => resolve(), millis))
}
