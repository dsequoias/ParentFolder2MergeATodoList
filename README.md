# TodoApp

A React Native mobile application for managing todos using SQLite database.

## Features

- ✅ Create, read, update, and delete todos
- ✅ Mark todos as completed/incomplete
- ✅ Set due dates and times for tasks
- ✅ Add notes to todos (max 50 characters)
- ✅ Task names limited to 20 characters
- ✅ Automatic completion datetime tracking
- ✅ Beautiful, modern UI with Material Design

## Database Schema

The app uses SQLite database `TodoDB.db` with the following table structure:

- **Task** (TEXT, max 20 chars, required)
- **Date** (DATE)
- **Time** (TIME)
- **Completed** (INTEGER, 0 or 1)
- **Notes** (TEXT, max 50 chars)
- **CompletDateTime** (DATETIME) - Automatically set when task is completed

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- For iOS: Xcode (Mac only)
- For Android: Android Studio

## Installation

1. Navigate to the TodoApp directory:
   ```bash
   cd TodoApp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Expo development server:
   ```bash
   npm start
   ```

### Updating the real TodoDB.db from the web app

When you run the app in the **browser**, it normally uses in-memory/localStorage data. To have the web UI read and write your actual `TodoDB.db` file:

1. From the repo root (e.g. `SQLite/Databases`), start the local API server:
   ```bash
   cd todo-api-server
   npm install
   npm start
   ```
   The server runs at `http://localhost:3001` and opens `TodoDB.db` in the parent folder.

2. With the server running, start the TodoApp and open it in the **browser** (press `w` in the Expo terminal). The web app will detect the server and use it for all list/save/update/delete actions, so **TodosTB in TodoDB.db is updated** when you add, edit, complete, or delete tasks.

3. **Important:** Deletes and updates only write to the real database when you use the **web** app (browser) with the API server running. If delete/update doesn’t change the file, start the API server first, then open the app in the browser (not in Expo Go on a phone).

4. Run on your device:
   - **iOS**: Press `i` in the terminal or scan QR code with Expo Go app
   - **Android**: Press `a` in the terminal or scan QR code with Expo Go app
   - **Web**: Press `w` in the terminal

## Usage

### Adding a Todo
1. Tap the **+** button (floating action button) at the bottom right
2. Enter task name (required, max 20 characters)
3. Optionally set date and time
4. Optionally add notes (max 50 characters)
5. Tap "Save Todo"

### Editing a Todo
1. Tap on any todo item in the list
2. Modify the fields as needed
3. Tap "Save Todo"

### Completing a Todo
1. Tap the checkbox next to a todo item, OR
2. Open the todo detail screen and toggle "Mark as completed"

### Deleting a Todo
1. Tap the trash icon (🗑️) next to any todo item
2. Confirm deletion

## Project Structure

```
TodoApp/
├── App.js                 # Main app component with navigation
├── screens/
│   ├── TodoListScreen.js  # List view of all todos
│   └── TodoDetailScreen.js # Add/Edit todo screen
├── services/
│   └── database.js        # SQLite database operations
├── package.json           # Dependencies and scripts
└── README.md             # This file
```

## Database Location

The SQLite database is stored in the app's document directory. On first launch, the app will create the database and tables automatically.

## Notes

- The app uses Expo SQLite for database operations
- All database operations are asynchronous
- The database is created automatically on first app launch
- Task names are limited to 20 characters
- Notes are limited to 50 characters
- Completed tasks automatically get a completion datetime set

## Troubleshooting

### Database errors
- Make sure the app has proper permissions
- Try uninstalling and reinstalling the app to reset the database

### Build errors
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Clear Expo cache: `expo start -c`

## License

This project is open source and available for personal use.
