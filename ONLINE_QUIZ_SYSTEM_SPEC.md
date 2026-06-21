# Online Live Quiz System Spec

## Purpose

Build a lightweight online classroom quiz system for synchronous in-class quizzes. The experience is similar to a paced Kahoot-style quiz, but optimized for teaching and formative assessment rather than competition.

The system should support one host/proctor and many participants in the same live quiz room. The host controls quiz progression, while participants answer one question at a time from their own devices.

## MVP Positioning

This is not a high-stakes remote proctoring system. The MVP is designed for classroom quizzes, participation checks, and teaching feedback.

Primary goals:

- Fast ad-hoc room creation.
- No participant account requirement.
- Live, host-paced questions.
- Automatic per-question reveal after time expires.
- Reliable refresh/reconnect behavior for host and participants.
- Temporary result storage for later export.

Non-goals for MVP:

- Camera, microphone, or screen monitoring.
- Lockdown browser behavior.
- Permanent question bank.
- Participant leaderboard.
- Teacher account system as the first path.
- Presenter/projector screen.
- Randomized question or choice order.

## Users

### Host

The host is the instructor or quiz controller. The host creates a room, adds or imports questions, starts the quiz, monitors participants, voids problematic questions, and exports final scores.

MVP host access does not require login. The host receives an admin link or host token when creating the room. This token allows the host to return to the same room, control the quiz, and access results for 7 days.

### Participant

The participant is a student or quiz taker. Participants join using:

- Room code.
- Username.

No participant login, student ID, email, or password is required in the MVP.

Within a room, usernames must be unique.

## Core Quiz Model

The MVP uses ad-hoc quiz rooms.

The host creates a room first, then adds or imports questions inside that room. Questions do not need to be saved into a permanent question bank.

Each room contains:

- Room code for participants.
- Admin link or host token for the host.
- Global default time per question.
- Optional per-question time override.
- Ordered list of questions.
- Participant list.
- Live quiz state.
- Result data retained for 7 days.

## Question Format

MVP questions are multiple-choice questions with:

- Text prompt.
- Optional image in the question prompt.
- 4-5 text choices.
- One correct answer.
- Optional explanation.
- Optional per-question time override.

Images:

- Host can upload an image while creating a question in the web UI.
- CSV/XLSX import can provide an `image_url`.
- MVP does not need image choices.
- MVP does not need embedded Excel image extraction.

Question and choice order:

- No randomization in MVP.
- All participants see the same question and same choice order.

## UI Language

Application UI should be English only.

Question content must support Unicode text, including Thai, English, and mixed-language content.

## Host Flow

1. Host creates a new room.
2. System generates:
   - Participant room code.
   - Admin link or host token.
3. Host sets global default time per question.
4. Host adds questions manually or imports CSV/XLSX.
5. Host reviews participant lobby.
6. Host starts the quiz when ready.
7. System presents one question at a time to participants.
8. Timer expires.
9. System automatically locks answers and reveals results.
10. Host reviews distribution and explanation.
11. Host clicks next question.
12. Host may void a problematic question, with confirmation.
13. Quiz ends after the final question.
14. Host exports results as username plus total score.

The host may refresh the browser at any point. Refresh must not reset the room, quiz state, lobby state, participant list, or timer.

## Participant Flow

1. Participant enters room code and username.
2. System rejects duplicate active usernames in the same room.
3. Participant joins the lobby.
4. Participant waits until host starts.
5. Participant sees one active question at a time.
6. Participant selects an answer.
7. If time expires before explicit submit, the latest selected answer is counted.
8. After time expires, participant sees:
   - Their submitted answer.
   - Correct answer.
   - Explanation, if present.
   - Score outcome for the question.
9. If participant did not answer, they see:
   - "No answer submitted".
   - Correct answer.
   - Explanation, if present.
   - 0 points for the question.
10. Participant remains on the reveal screen until host advances.

Participants may refresh or reconnect. Refresh must restore the participant to the current room state without restarting their quiz or sending them back incorrectly.

## Lobby Rules

The room has a lobby before the quiz starts.

Host can:

- See participant list.
- See participant count.
- Kick participants.
- Release stale participant locks.
- Start quiz when ready.

Participant can:

- Join with room code and username.
- Wait for host to start.
- Refresh without losing lobby membership.

Username rules:

- Username must be unique among active participants in a room.
- The same username cannot join from a second active session.
- Refresh from the same browser session is allowed.

## Live Quiz State Machine

Recommended room states:

- `draft`: Host is adding/importing questions.
- `lobby`: Room is open and participants can join.
- `question_active`: Current question is visible and timer is running.
- `question_reveal`: Current question is locked and answer/explanation/results are visible.
- `finished`: Quiz is complete and results can be exported.
- `expired`: Admin link and result data are no longer available.

Recommended per-question states:

- `pending`: Question has not started.
- `active`: Timer is running.
- `revealed`: Timer ended and answer is shown.
- `voided`: Question was removed from scoring and skipped.

Host transitions:

- `draft` to `lobby` after questions are valid.
- `lobby` to `question_active` when host starts quiz.
- `question_reveal` to next `question_active` when host clicks next.
- Any not-yet-completed question can be voided by host confirmation.
- Last `question_reveal` to `finished` when host ends quiz.

System transitions:

- `question_active` to `question_reveal` automatically when the server-authoritative timer expires.
- Results expire after 7 days.

## Timer Rules

The timer must be authoritative on the server.

The client may display a countdown, but answer lock should be based on server time to avoid refresh, clock drift, or client-side manipulation.

Timing behavior:

- Host sets a global default time for all questions.
- Host can override time per question.
- On question start, server records `started_at` and `ends_at`.
- When `ends_at` is reached, answers lock and reveal state begins automatically.
- Host controls when the next question starts.

## Answer Rules

Scoring:

- Correct answer: 1 point.
- Incorrect answer: 0 points.
- No answer: 0 points.
- No speed-based scoring.
- Voided questions do not count for anyone.

Answer capture:

- The latest selected answer before time expires is counted.
- Explicit submit is useful for feedback, but not required for scoring if an answer was selected.
- Once the question is revealed, no more answers are accepted.

## Reveal Rules

After each question timer expires, the system automatically moves to reveal.

Participant reveal screen shows:

- Their chosen answer.
- Correct answer.
- Explanation, if present.
- Whether they were correct.
- If no answer was selected, show "No answer submitted".

Host reveal screen shows:

- Choice distribution.
- Number and percentage choosing each option.
- Correct answer.
- Explanation, if present.
- Names grouped by selected choice.
- Names of participants who did not answer.

No participant leaderboard is shown.

## Refresh And Reconnect Rules

Refresh and reconnect are first-class requirements.

Host:

- Host access is restored by admin link or host token.
- Refreshing lobby or control page must not reset the room.
- Refreshing during an active question must restore the current live state.
- Host token remains valid until session expiry, currently 7 days.

Participant:

- First join creates a participant session token stored in browser storage or cookie.
- The server binds room code, username, and participant session token.
- Refresh from the same browser uses the same token and restores state.
- Network reconnect restores the current room state.
- If the current question is still active, participant can continue before time expires.
- If the question already expired, participant sees reveal state.

Duplicate session prevention:

- Same username from a different active browser/session is rejected.
- Stale locks are released automatically when heartbeat disappears for 60-90 seconds.
- Host can kick/release participant lock immediately.

## Light Integrity Controls

MVP uses light controls only:

- Unique active username per room.
- Participant session token.
- Heartbeat tracking.
- Host can kick participants.
- Browser refresh/reconnect does not reset quiz state.
- Answer lock at server-authoritative timer end.
- Optional client-side detection of tab switch or leaving page can be logged or shown to host later, but should not block the MVP.

No MVP camera, microphone, screen recording, or lockdown browser.

## Import And Creation

Question creation methods:

- Manual web form.
- CSV/XLSX import.

Recommended import columns:

- `prompt`
- `choice_a`
- `choice_b`
- `choice_c`
- `choice_d`
- `choice_e` optional
- `correct_answer`
- `explanation` optional
- `image_url` optional
- `time_limit_seconds` optional

Validation before quiz can start:

- At least one valid question.
- Every question has prompt text or image.
- Every question has 4-5 choices.
- Correct answer matches an existing choice.
- Time limit is positive.

Editing:

- Host can edit questions before the quiz starts.
- Host cannot edit questions after the quiz starts.
- Host can void problematic questions during the quiz.

## Result Storage And Export

Results are retained for 7 days.

Export format for MVP:

- CSV/XLSX with `username` and `total_score`.

The system may store more detailed per-question result data internally for:

- Host reveal screens.
- Debugging reconnect issues.
- Recomputing total scores.
- Temporary review during the 7-day retention window.

After 7 days:

- Admin link expires.
- Results are deleted or made inaccessible.
- Room cannot be controlled or exported.

## Recommended Technical Architecture

Recommended stack:

- Frontend/application: Next.js.
- Database: PostgreSQL.
- Real-time/session state: Redis.
- Real-time transport: WebSocket or Server-Sent Events.
- Object storage: S3-compatible storage for uploaded question images.
- Background cleanup: scheduled job to expire rooms and results after 7 days.

Why this shape:

- PostgreSQL stores durable room/question/result records.
- Redis handles live room state, participant presence, locks, and timers.
- WebSocket/SSE pushes live state changes to host and participants.
- Server-authoritative timers prevent client refresh from changing quiz state.
- Object storage keeps uploaded images outside the database.

Potential deployment targets:

- Railway.
- Fly.io.
- Render.
- VPS with Docker.
- Supabase/Postgres plus a separate realtime service can be considered, but timer and room state still need careful server authority.

## Suggested Data Model

### Room

- `id`
- `room_code`
- `host_token_hash`
- `state`
- `global_time_limit_seconds`
- `current_question_index`
- `created_at`
- `expires_at`

### Question

- `id`
- `room_id`
- `position`
- `prompt`
- `image_url`
- `choices`
- `correct_choice_id`
- `explanation`
- `time_limit_seconds`
- `state`
- `voided_at`

### Participant

- `id`
- `room_id`
- `username`
- `session_token_hash`
- `connection_state`
- `last_heartbeat_at`
- `joined_at`
- `kicked_at`

### Answer

- `id`
- `room_id`
- `question_id`
- `participant_id`
- `selected_choice_id`
- `selected_at`
- `is_final`
- `is_correct`

### Result

- `room_id`
- `participant_id`
- `total_score`
- `updated_at`

## Suggested Real-Time Events

Host events:

- `room_created`
- `participant_joined`
- `participant_left`
- `participant_kicked`
- `quiz_started`
- `question_started`
- `question_revealed`
- `question_voided`
- `quiz_finished`

Participant events:

- `joined_lobby`
- `quiz_started`
- `question_started`
- `answer_saved`
- `question_revealed`
- `participant_kicked`
- `quiz_finished`

Server responsibilities:

- Broadcast canonical room state after each transition.
- Re-send current state after any reconnect.
- Reject invalid transitions.
- Reject answers after server-side question expiry.

## MVP Acceptance Criteria

- Host can create a room without login.
- Host receives a room code and admin link.
- Host can add MCQ questions manually.
- Host can import CSV/XLSX questions with optional `image_url`.
- Host can set global and per-question time limits.
- Participants can join with room code and username.
- Duplicate active usernames are rejected.
- Host sees lobby participant list and can kick participants.
- Host can start quiz manually.
- Participants see one question at a time.
- Timer expiry automatically reveals the answer.
- Latest selected answer before timeout is counted.
- Participant reveal shows selected answer, correct answer, and explanation.
- No-answer reveal shows "No answer submitted".
- Host reveal shows choice distribution and participant groupings.
- Host can void a question with confirmation.
- Voided questions do not affect score.
- Browser refresh does not reset host or participant state.
- Network reconnect restores current state.
- Same username from another active session is rejected.
- Stale locks release after 60-90 seconds or host action.
- Final export includes username and total score.
- Results and admin link expire after 7 days.

## Open Decisions For Later

- Whether to add teacher login after MVP.
- Whether to add optional student ID for more formal scoring.
- Whether to support presenter view.
- Whether to support participant leaderboard as an optional setting.
- Whether to support image choices.
- Whether to add tab-switch warnings or audit logs.
- Whether to add permanent quiz templates or a question bank.
- Whether to support English/Thai UI switching.

