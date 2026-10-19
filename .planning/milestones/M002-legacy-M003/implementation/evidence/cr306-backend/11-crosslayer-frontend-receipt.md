# CR306 frontend cross-layer harness receipt

- Authorization: bounded implementation support under transition 078/079.
- Date: 2026-10-12, cleanup completed at `2026-10-12T14:57:08+0800`.
- Scope: disposable current-schema PostgreSQL 18, the project `wordweave` and `wordweave-admin` binaries built from the shared current source, a synthetic administrator/model/provider fixture, and a localhost provider counter. No production source, frozen source package, control-plane file, UAT service, real credential, or paid provider was changed or called.

## Isolated environment

- Backend during the check: `http://127.0.0.1:54783`; metrics `127.0.0.1:54784`.
- Frontend origin contract: `http://127.0.0.1:5176`, with the temporary Nuxt server proxying same-origin `/api` requests to the backend.
- PostgreSQL during the check: container `wordweave-cr306-crosslayer-pg`, loopback port `65433`, newly initialized database only.
- Synthetic provider counter during the check: `127.0.0.1:54785`; it could only count and reject calls and made no outbound request.
- `wordweave` SHA-256: `9c0d33500a128a04cb2824591b8a7374cadf4babdc9213b4098e83d26fba233f`.
- `wordweave-admin` SHA-256: `c0593eb7d055d051da8c587d98ffd170a956582c3973231ed41f26c979df14fc`.

The administrative CLI applied the current migrations, passed `verify`, and created the synthetic administrator. Credentials, encryption keys, environment variables, cookies, and provider key existed only in mode-0600 files under the dedicated temporary runtime directory. They were never copied into this receipt, source artifacts, or logs.

## Backend preparation check

Before frontend handoff, the formal HTTP API completed:

1. administrator bootstrap/login and configuration revision read;
2. model plus connection creation with nested `custom_parameters`;
3. model GET readback;
4. rejected PATCH containing the protected `/custom_parameters/model` field;
5. post-rejection GET equality against the pre-rejection response.

The rejection was HTTP 422 with `protected_field`; model/configuration facts were unchanged and the provider counter remained `0`.

## Frontend cross-layer result

frontend-claire reported the actual temporary Nuxt `127.0.0.1:5176` to formal backend flow completed through the typed repository:

1. real administrator login and initial list;
2. provider/model POST with `{"temperature":0.2}`;
3. editor reopen and readback;
4. PATCH with `{"temperature":0.4,"reasoning":{"enabled":false}}`;
5. full page reload and GET readback of the exact JSON object.

The final Playwright run passed `1/1` in `3.9s`, no probe request was made, and the final provider-call count remained `0`. An initial test-only regular-expression assumption about JSONB key order failed even though the value was correct; frontend retained that failure and changed the assertion to JSON semantic equality before the passing run.

## Cleanup

- The backend and synthetic provider processes were terminated.
- The disposable PostgreSQL container was stopped and auto-removed.
- Loopback ports `54783`, `54784`, `54785`, and `65433` were confirmed closed.
- The complete temporary runtime directory, including all credentials, environment files, cookies, responses, binaries, and logs, was deleted.
- Existing UAT ports `3013`, `54672`, `54673`, `54674`, and `54675` were not stopped, restarted, or modified.
