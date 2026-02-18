# Spardha Backend

This is the Express.js + MongoDB backend for the Spardha Sports Fest application.

## Prerequisites
- Node.js (v14+)
- MongoDB (Running locally on port 27017, or update `.env`)

## Setup
1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Configure Environment:
    -   Check `.env` file. Update `mongodb` URI if needed.
    -   Default PORT is 5000.

## Running
-   **Development:**
    ```bash
    npm run dev
    ```
-   **Production:**
    ```bash
    npm start
    ```

## API Endpoints
-   `GET /` - Health check.
-   `POST /register` - Register a user/team. Expects Multipart form data.
    -   Fields: `name`, `email`, `contactNo`, `universityName`, `address`, `items` (JSON string).

## Folder Structure
-   `index.js` - Main server entry point.
-   `models/` - Mongoose schemas.
-   `routes/` - API routes.
-   `uploads/` - Directory for uploaded files.
# backend_spardha
