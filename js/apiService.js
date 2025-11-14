// js/apiService.js
// Centralized service for making API calls to the backend using pywebview.

let _authToken = null;
let _authUsername = null;

export const pywebviewReady = new Promise(resolve => {
    window.addEventListener('pywebviewready', () => {
        console.log('pywebview is ready');
        resolve();
    });
});

/**
 * Initializes authentication by attempting to load the token from sessionStorage.
 */
export function initAuth() {
    const storedToken = sessionStorage.getItem('authToken');
    const storedUsername = sessionStorage.getItem('authUsername');
    if (storedToken && storedUsername) {
        _authToken = storedToken;
        _authUsername = storedUsername;
        console.log('Auth token and username loaded from sessionStorage.');
    }
}

/**
 * Attempts to log in the user and retrieve a JWT.
 */
export async function login(username, password) {
    await pywebviewReady;
    try {
        const data = await window.pywebview.api.login(username, password);
        if (data.error) {
            throw new Error(data.error);
        }
        _authToken = data.token;
        _authUsername = data.username;
        sessionStorage.setItem('authToken', _authToken);
        sessionStorage.setItem('authUsername', _authUsername);
        return { token: _authToken, username: _authUsername };
    } catch (error) {
        console.error('Failed to login:', error);
        throw error;
    }
}

/**
 * Logs out the user.
 */
export function logout() {
    _authToken = null;
    _authUsername = null;
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('authUsername');
    console.log('User logged out.');
}

/**
 * Returns the currently authenticated username.
 */
export function getAuthenticatedUsername() {
    return _authUsername;
}

async function handleApiResponse(response) {
    if (response && response.error) {
        if (response.error === "Authentication required.") {
            logout();
            throw new Error(`Authentication Required: ${response.error}. Please re-login.`);
        }
        throw new Error(response.error);
    }
    return response;
}

/**
 * Loads a task's full details from the server.
 */
export async function loadTaskFromServer(taskId) {
    await pywebviewReady;
    try {
        const response = await window.pywebview.api.load_task(_authToken, taskId);
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to load task from server:', error);
        throw error;
    }
}

/**
 * Loads a summary of tasks from the server.
 */
export async function loadTasksSummaryFromServer(filters = {}, pagination = {}) {
    await pywebviewReady;
    try {
        const response = await window.pywebview.api.load_tasks_summary(_authToken, filters, pagination);
        console.log(response);
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to load task summaries from server:', error);
        throw error;
    }
}

/**
 * Sends task data to the Python server.
 */
export async function saveTaskToServer(task) {
    await pywebviewReady;
    try {
        const response = await window.pywebview.api.save_task(_authToken, task);
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to save task to server:', error);
        throw error;
    }
}

/**
 * Deletes a task from the Python server.
 */
export async function deleteTaskFromServer(taskId) {
    await pywebviewReady;
    try {
        const response = await window.pywebview.api.delete_task(_authToken, taskId);
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to delete task from server:', error);
        throw error;
    }
}

/**
 * Loads all milestones for a given task from the server.
 */
export async function loadMilestonesForTaskFromServer(taskId) {
    await pywebviewReady;
    try {
        const response = await window.pywebview.api.load_milestones_for_task(_authToken, taskId);
        return await handleApiResponse(response);
    } catch (error) {
        console.error(`Failed to load milestones for task '${taskId}' from server:`, error);
        throw error;
    }
}

/**
 * Sends milestone data to the Python server.
 */
export async function saveMilestoneToServer(milestone, taskId) {
    await pywebviewReady;
    try {
        const response = await window.pywebview.api.save_milestone(_authToken, milestone, taskId);
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to save milestone to server:', error);
        throw error;
    }
}

/**
 * Loads a single milestone's full details from the server.
 */
export async function loadMilestoneFromServer(taskId, milestoneId) {
    await pywebviewReady;
    try {
        const response = await window.pywebview.api.load_milestone(_authToken, taskId, milestoneId);
        return await handleApiResponse(response);
    } catch (error) {
        console.error(`Failed to load milestone '${milestoneId}' from server:`, error);
        throw error;
    }
}

/**
 * Deletes milestone data from the Python server.
 */
export async function deleteMilestoneFromServer(milestoneId, taskId) {
    await pywebviewReady;
    try {
        const response = await window.pywebview.api.delete_milestone(_authToken, milestoneId, taskId);
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to delete milestone from server:', error);
        throw error;
    }
}

/**
 * Loads a distinct list of statuses from the server.
 */
export async function getStatusesFromServer(onlyActive = false) {
    await pywebviewReady;
    try {
        const response = await window.pywebview.api.get_distinct_statuses(_authToken, onlyActive);
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to load statuses from server:', error);
        throw error;
    }
}

/**
 * Loads a distinct list of 'from' values from the server.
 */
export async function getFromValuesFromServer(onlyActive = false) {
    await pywebviewReady;
    try {
        const response = await window.pywebview.api.get_distinct_from_values(_authToken, onlyActive);
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to load from values from server:', error);
        throw error;
    }
}

/**
 * Loads a distinct list of categories from the server.
 */
export async function getCategoriesFromServer(onlyActive = false) {
    await pywebviewReady;
    try {
        const response = await window.pywebview.api.get_distinct_categories(_authToken, onlyActive);
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to load categories from server:', error);
        throw error;
    }
}

/**
 * Gets task counts by status from the server.
 */
export async function getTaskCounts(since = null) {
    await pywebviewReady;
    try {
        const response = await window.pywebview.api.get_task_counts(_authToken, since);
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to get task counts from server:', error);
        throw error;
    }
}

/**
 * delete status by its description
 */
export async function deleteStatusFromServer(description) {
    await pywebviewReady;
    try {
        const response = await window.pywebview.api.delete_status_values(_authToken, description);
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to delete status from server:', error);
        throw error;
    }
}

/**
 * delete from (origin) by its description
 */
export async function deleteFromValueFromServer(description) {
    await pywebviewReady;
    try {
        const response = await window.pywebview.api.delete_from_values(_authToken, description);
        return await handleApiResponse(response);
    } catch (error) {
        console.error('Failed to delete from value from server:', error);
        throw error;
    }
}