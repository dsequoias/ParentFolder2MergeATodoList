# Fix: "Experience with id '...' does not exist"

This error means the **EAS project ID** in your app is invalid (project was deleted, wrong account, or never created). Fix it like this:

## 1. Remove the invalid project ID from `app.json`

- Open **`app.json`**.
- Find the **`"extra"`** block. It looks like:
  ```json
  "extra": {
    "eas": {
      "projectId": "caaea2da-6a04-4d72-acbc-5d3ea0067025"
    }
  }
  ```
- **Delete the whole `"extra"` block** (including the comma before it so the JSON stays valid).
- If the file is one long line, remove this part:  
  `,"extra":{"eas":{"projectId":"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}}`  
  and make sure the line still ends with `}}` (closing `expo` and the root object).
- Save the file.

## 2. Let EAS create/link a new project

In the project folder run:

```bash
eas build:configure
```

When asked, choose **yes** to create a new EAS project (or link an existing one). EAS will write a new valid `projectId` into `app.json`.

## 3. Build again

```bash
eas build --platform android --profile preview
```

---

**Why it happens:** The project was removed on Expo, or the ID was copied from another account/project. After removing it and running `eas build:configure`, you get a valid project linked to your account.
