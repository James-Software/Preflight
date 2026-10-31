const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { load } = require("./load-module.cjs");
const api = load("lib/automatic-persistence.ts", {});
test("page and navigation checks cannot independently schedule form submissions", () => {
  for (const id of [
    "homepage-load",
    "homepage-status",
    "visit-about",
    "signed-in-page",
    "signed-in-navigation",
  ])
    assert.equal(api.automaticStepCanWrite(id), false, id);
  for (const id of [
    "form-1",
    "automatic-database-create",
    "signed-in-interaction",
    undefined,
  ])
    assert.equal(api.automaticStepCanWrite(id), true, id);
});
test("missing-email proof requires one matching storage table and a positive acceptance, excluding errors and pending confirmation", () => {
  const target = { table: "waitlist_entries", key: "id", columns: ["email"] };
  assert.deepEqual(api.emailPersistenceTarget([target]), target);
  assert.equal(
    api.emailPersistenceTarget([
      target,
      { ...target, table: "newsletter_subscribers" },
    ]),
    null,
  );
  assert.equal(
    api.emailPersistenceTarget([{ ...target, table: "users" }]),
    null,
  );
  assert.equal(api.acceptedEmailNotice("You have entered the waitlist!"), true);
  for (const text of [
    "You have not joined the waitlist",
    "Waitlist request queued successfully",
    "Already subscribed to the newsletter",
    "Confirm your email to join the waitlist",
    "Invalid email address",
  ])
    assert.equal(api.acceptedEmailNotice(text), false, text);
});
