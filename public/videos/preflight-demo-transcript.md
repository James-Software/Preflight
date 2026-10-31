# PreFlight product demonstration

Recorded October 31, 2026. Real deployed application screens and interactions. Cloud processing wait shortened; no report outcomes are fabricated. Synthetic narration.


## 01 · Product and problem

This is PreFlight, an AI testing application for deployed websites. The problem is simple: a user interface can look successful while the underlying workflow is broken. PreFlight combines browser interaction, application evidence, and configured database expectations. This demonstration uses the real deployed application and a deliberately broken waitlist. Any time spent waiting for cloud processing is shortened in this recording.


## 02 · The broken waitlist

Here is the example. I enter an email address and click Join the waitlist. The email disappears, and a toast says, You have entered the waitlist. To a visitor, the action appears successful. But the submit handler never calls the waitlist API. The database remains empty. This is an intentional persistence bug, not a database connection error. Looking only at the toast would miss it.


## 03 · A private guest run

A judge opens a separate invitation and receives an isolated guest workspace, without signing in to GitHub. The secure guest cookie identifies that session. Other guests and the sponsor's personal projects remain inaccessible. The example project already has a read-only database verification configured. The check looks for the unique email marker submitted during this run. I select the workflow and start the swarm. No per-user run quota is enabled for this pilot.


## 04 · Two independent persistence failures

The persistence contract requires more than an AI opinion. The browser must submit the current unique marker and observe a newly displayed success message. The read-only query must then fail its expected row count. A fresh browser context repeats the interaction with a different marker. Only when both accepted submissions fail their database expectations does this path confirm a persistence defect. Invalid input, an old toast, or a cloud service failure cannot establish the same conclusion.


## 05 · Architecture and trust boundaries

The architecture separates the web application, background workers, and browser execution. Next.js on Vercel authorizes the project and run. Trigger manages the agents. Neon stores persistent projects and reports. Browser requests pass through a restricted network policy. A Vercel Sandbox fallback runs Chromium in a disposable virtual machine with outbound access denied and without production database, GitHub, or model credentials. Source investigation uses a separately authorized broker and a pinned repository commit. Evidence and uncertainty stay visible in the report.


## 06 · Source, evidence and commercial model

The public repository includes the system design, local setup, automated checks, and deployment history. The submission resources also describe the target customer, distribution plan, and financial assumptions. Proposed pricing is clearly labeled; real payment activation is still pending. The pilot demonstrates the central user loop: connect an app, run a workflow, and inspect evidence about what actually happened. This narration is synthetic. The application screens and recorded interactions are real.
