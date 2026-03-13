export async function waitForMilliseconds(millis) {
    await new Promise((resolve) => setTimeout(() => resolve(), millis));
}
