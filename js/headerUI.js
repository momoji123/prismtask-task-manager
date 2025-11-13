// headerUI.js
// This module handles header functionalities: settings dropdown,
// export/import data, and managing custom lists (categories, statuses, froms).

import { DB } from './storage.js';
import { escapeHtml, showModalAlert, showModalAlertConfirm } from './utilUI.js';
// Import the new functions for login, logout, and getting authenticated username
import { login, logout, getAuthenticatedUsername, initAuth, saveTaskToServer, saveMilestoneToServer, loadTasksSummaryFromServer, loadTaskFromServer, loadMilestonesForTaskFromServer, 
  getCategoriesFromServer, getStatusesFromServer, getFromValuesFromServer 
} from './apiService.js';
import { renderTaskList, getCurrentFilters } from './leftMenuTaskUI.js';

// Internal state, initialized by the main UI module
let categories = [];
let statuses = [];
let froms = [];
let username = null; // Username will now be managed via apiService's token
let renderTaskListCallback = null; // Callback to trigger task list re-render in leftMenuTaskUI
let updateLeftMenuTaskUICallback = null; // New callback
let updateTaskEditorUICallback = null;   // New callback
let updateMilestoneEditorUICallback = null; // New callback
let updateUsernameCallback = null; // New callback to update username in UI module

const selectors = {
  exportBtn: '#exportBtn',
  importBtn: '#importBtn',
  importFile: '#importFile',
  settingsBtn: '#settingsBtn',
  settingsDropdown: '#settingsDropdown',
  manageCategoriesBtn: '#manageCategoriesBtn',
  manageStatusesBtn: '#manageStatusesBtn',
  manageFromsBtn: '#manageFromsBtn',
  manageAuthBtn: '#manageAuthBtn', // Renamed selector for authentication settings
  filterCategoryMultiSelect: '#filterCategoryMultiSelect', // Needed for dropdown close logic
};

/**
 * Initializes header-related event listeners and state.
 * @param {object} initialState - Object containing initial categories, statuses, froms, and username.
 * @param {function} onRenderTaskList - Callback function to re-render the task list.
 * @param {function} onRenderFilterCategoriesMultiSelect - Callback to re-render category filter.
 * @param {function} onRenderStatusOptions - Callback to re-render status filter options.
 * @param {function} onUpdateLeftMenuTaskUI - Callback to update LeftMenuTaskUI's state.
 * @param {function} onUpdateTaskEditorUI - Callback to update TaskEditorUI's state.
 * @param {function} onUpdateMilestoneEditorUI - Callback to update MilestoneEditorUI's state.
 * @param {function} onUpdateUsername - Callback to update the username in the main UI module.
 */
export function initHeader(
  initialState,
  onRenderTaskList,
  onRenderFilterCategoriesMultiSelect,
  onRenderStatusOptions,
  onUpdateLeftMenuTaskUI,
  onUpdateTaskEditorUI,
  onUpdateMilestoneEditorUI,
  onUpdateUsername
) {
  categories = initialState.categories;
  statuses = initialState.statuses;
  froms = initialState.froms;
  // username is now initially managed by apiService
  username = getAuthenticatedUsername(); // Get username from apiService
  renderTaskListCallback = onRenderTaskList;
  const renderFilterCategoriesMultiSelectCallback = onRenderFilterCategoriesMultiSelect;
  const renderStatusOptionsCallback = onRenderStatusOptions;
  updateLeftMenuTaskUICallback = onUpdateLeftMenuTaskUI;
  updateTaskEditorUICallback = onUpdateTaskEditorUI;
  updateMilestoneEditorUICallback = onUpdateMilestoneEditorUI;
  updateUsernameCallback = onUpdateUsername;

  // Initialize auth from session storage on load
  initAuth();
  // Update username displayed in the UI after initAuth
  username = getAuthenticatedUsername();
  if (updateUsernameCallback) updateUsernameCallback(username);


  const settingsBtn = document.querySelector(selectors.settingsBtn);
  const settingsDropdown = document.querySelector(selectors.settingsDropdown);

  if (settingsBtn) {
    settingsBtn.addEventListener('click', (event) => {
      settingsDropdown.classList.toggle('show');
      event.stopPropagation();
    });
  }

  window.addEventListener('click', (event) => {
    if (settingsDropdown && !event.target.matches(selectors.settingsBtn) && !event.target.closest(selectors.filterCategoryMultiSelect) && settingsDropdown.classList.contains('show')) {
      settingsDropdown.classList.remove('show');
    }
  });

  document.querySelector(selectors.manageCategoriesBtn)?.addEventListener('click', () => manageList('categories', 'Manage Categories', renderFilterCategoriesMultiSelectCallback, renderStatusOptionsCallback));
  document.querySelector(selectors.manageStatusesBtn)?.addEventListener('click', () => manageList('statuses', 'Manage Statuses', renderFilterCategoriesMultiSelectCallback, renderStatusOptionsCallback));
  document.querySelector(selectors.manageFromsBtn)?.addEventListener('click', () => manageList('froms', 'Manage "From" Sources', renderFilterCategoriesMultiSelectCallback, renderStatusOptionsCallback));
  document.querySelector(selectors.manageAuthBtn)?.addEventListener('click', () => manageAuthentication(updateUsernameCallback)); // Updated to call manageAuthentication

  document.querySelector(selectors.exportBtn)?.addEventListener('click', exportJSON);
  document.querySelector(selectors.importBtn)?.addEventListener('click', () => document.querySelector(selectors.importFile)?.click());
  document.querySelector(selectors.importFile)?.addEventListener('change', importJSON);
  
  updateSettingsDropdownVisibility();
}

function updateSettingsDropdownVisibility() {
    const loggedIn = !!getAuthenticatedUsername();
    document.querySelector(selectors.manageCategoriesBtn).style.display = loggedIn ? 'block' : 'none';
    document.querySelector(selectors.manageStatusesBtn).style.display = loggedIn ? 'block' : 'none';
    document.querySelector(selectors.manageFromsBtn).style.display = loggedIn ? 'block' : 'none';
}

/**
 * Updates the internal lists (categories, statuses, froms) and username.
 * This function is called from the main UI module when global state changes.
 * @param {object} updatedState - Object with updated lists and/or username.
 */
export function updateHeaderState(updatedState) {
  if (updatedState.categories) categories = updatedState.categories;
  if (updatedState.statuses) statuses = updatedState.statuses;
  if (updatedState.froms) froms = updatedState.froms;
  // Username update is now primarily driven by apiService login/logout
  if (updatedState.username !== undefined) username = updatedState.username;
}


/**
 * Generic function to manage lists (categories, statuses, froms) using a custom modal.
 * This function directly creates and manages the modal, allowing for interactive list editing.
 * @param {string} type - The type of list to manage ('categories', 'statuses', 'froms').
 * @param {string} title - The title for the modal.
 * @param {function} renderFilterCategoriesMultiSelectCallback - Callback to re-render category filter.
 * @param {function} renderStatusOptionsCallback - Callback to re-render status filter options.
 */
async function manageList(type, title, renderFilterCategoriesMultiSelectCallback, renderStatusOptionsCallback) {
  let currentList;
  let defaultList = [];
  let putMetaKey;

  if (type === 'categories') {
    currentList = [...categories];
    defaultList = [];
    putMetaKey = 'categories';
  } else if (type === 'statuses') {
    currentList = [...statuses];
    defaultList = [];
    putMetaKey = 'statuses';
  } else if (type === 'froms') {
    currentList = [...froms];
    defaultList = [];
    putMetaKey = 'froms';
  } else {
    console.error('Unknown list type:', type);
    return;
  }

  let tempList = [...currentList]; // Temporary list for edits within the modal

  // Get the modal template and clone it
  const modalTemplate = document.getElementById('modal-template');
  if (!modalTemplate) {
    console.error('Modal template not found.');
    return;
  }
  const modalClone = modalTemplate.content.cloneNode(true);
  const modalBackdrop = modalClone.querySelector('.modal-backdrop');
  const modalHeaderTitle = modalClone.querySelector('.modal-header h3');
  const modalBody = modalClone.querySelector('.modal-body');
  const saveBtn = modalClone.querySelector('.modal-save');
  const cancelBtn = modalClone.querySelector('.modal-cancel');
  const closeBtn = modalClone.querySelector('.modal-close');

  modalHeaderTitle.textContent = title;

  // Set up the content for the modal body
  modalBody.innerHTML = `
    <div class="list-manager-container">
      <div class="tag-list-modal" id="listManagerTags"></div>
      <div style="display:flex; gap:8px; margin-top: 12px;">
        <input type="text" id="listManagerInput" placeholder="Add new ${type.slice(0, -1) || 'item'}..." class="flex-grow">
        <button id="listManagerAddBtn">Add</button>
        <button id="listManagerUpdateBtn">Update</button>
      </div>
    </div>
  `;

  // Append the modal to the body
  document.body.appendChild(modalBackdrop);

  // Get references to the elements *after* they are in the DOM
  const listManagerTags = modalBody.querySelector('#listManagerTags');
  const listManagerInput = modalBody.querySelector('#listManagerInput');
  const listManagerAddBtn = modalBody.querySelector('#listManagerAddBtn');
  const listManagerUpdateBtn = modalBody.querySelector('#listManagerUpdateBtn');

  // Function to render tags inside the modal
  const renderModalTags = () => {
    listManagerTags.innerHTML = '';
    tempList.forEach((item, idx) => {
      const tag = document.createElement('div');
      tag.className = 'tag selected';
      tag.innerHTML = `${escapeHtml(item)}<button data-idx="${idx}">x</button>`;
      listManagerTags.appendChild(tag);
    });

    // Add event listeners for remove buttons
    listManagerTags.querySelectorAll('.tag button').forEach(button => {
      button.addEventListener('click', async (e) => {
        const idxToRemove = parseInt(e.target.dataset.idx);
        const itemToRemove = tempList[idxToRemove];

        let isInUse = false;
        if (type === 'categories') {
          var categories = await getCategoriesFromServer();
          isInUse = categories.some(category => category ===itemToRemove);
          if (isInUse) {
            showModalAlert(`Cannot delete category "${itemToRemove}" because it is currently in use`);
          }
        } else if (type === 'statuses') {
          // Check if status is used by tasks OR milestones
          var statuses = await getStatusesFromServer();

          isInUse = statuses.some(stat => stat ===itemToRemove);
          if (isInUse) {
            showModalAlert(`Cannot delete status "${itemToRemove}" because it is currently in use by one or more tasks or milestones.`);
          }
        } else if (type === 'froms') {
          var froms = await getFromValuesFromServer();

          isInUse = froms.some(from => from === itemToRemove);
          if (isInUse) {
            showModalAlert(`Cannot delete "From" source "${itemToRemove}" because it is currently used by one or more tasks.`);
          }
        }

        if (isInUse) {
          return; // Prevent deletion if in use
        }

        tempList.splice(idxToRemove, 1);
        renderModalTags();
      });
    });
  };

  // Initial render of tags
  renderModalTags();

  // Add item functionality
  if (listManagerAddBtn) {
    listManagerAddBtn.addEventListener('click', () => {
      const newItem = listManagerInput.value.trim();
      if (newItem && !tempList.includes(newItem)) {
        tempList.push(newItem);
        listManagerInput.value = '';
        renderModalTags();
      } else if (newItem && tempList.includes(newItem)) {
        showModalAlert(`"${newItem}" already exists in the list.`);
      }
    });
  }

  // Update from server functionality
  if (listManagerUpdateBtn) {
    listManagerUpdateBtn.addEventListener('click', async () => {
      let serverList = [];
      if (type === 'categories') {
        serverList = await getCategoriesFromServer();
      } else if (type === 'statuses') {
        serverList = await getStatusesFromServer();
      } else if (type === 'froms') {
        serverList = await getFromValuesFromServer();
      }

      const missingItems = serverList.filter(item => !tempList.includes(item));
      if (missingItems.length > 0) {
        tempList.push(...missingItems);
        renderModalTags();
        showModalAlert(`Added missing items: ${missingItems.join(', ')}`);
      } else {
        showModalAlert('No new items to add from the server.');
      }
    });
  }

  // Allow adding by pressing Enter in the input field
  if (listManagerInput) {
    listManagerInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        listManagerAddBtn.click();
      }
    });
  }

  // Handle Save/Cancel/Close button clicks for the modal
  return new Promise(resolve => {
    const cleanupAndResolve = (saved) => {
      modalBackdrop.remove(); // Remove modal from DOM
      resolve(saved);
    };

    saveBtn.onclick = () => cleanupAndResolve(true);
    cancelBtn.onclick = () => cleanupAndResolve(false);
    closeBtn.onclick = () => cleanupAndResolve(false); // Treat closing via 'x' as cancel
  })
  .then(async (saved) => {
    if (saved) {
      let finalUpdateList = tempList;
      // Prevent saving an empty list; revert to default if empty
      if (tempList.length === 0) {
        showModalAlert(`List for ${type} cannot be empty. Reverting to default values.`);
        finalUpdateList = defaultList;
      }

      // Update the main categories/statuses/froms array
      if (type === 'categories') {
        categories = finalUpdateList;
        // Also update selectedFilterCategories if a category was removed
        let selectedFilterCategories = (await DB.getMeta('selectedFilterCategories')) || [];
        selectedFilterCategories = selectedFilterCategories.filter(cat => categories.includes(cat));
        await DB.putMeta('selectedFilterCategories', selectedFilterCategories);
        if (renderFilterCategoriesMultiSelectCallback) renderFilterCategoriesMultiSelectCallback(); // Re-render the multi-select filter
        if (updateLeftMenuTaskUICallback) updateLeftMenuTaskUICallback({ categories: finalUpdateList, selectedFilterCategories: selectedFilterCategories });
        if (updateTaskEditorUICallback) updateTaskEditorUICallback({ categories: finalUpdateList });
      } else if (type === 'statuses') {
        statuses = finalUpdateList;
        if (renderStatusOptionsCallback) renderStatusOptionsCallback(); // Re-render filter options if statuses changed
        if (updateLeftMenuTaskUICallback) updateLeftMenuTaskUICallback({ statuses: finalUpdateList });
        if (updateTaskEditorUICallback) updateTaskEditorUICallback({ statuses: finalUpdateList });
        if (updateMilestoneEditorUICallback) updateMilestoneEditorUICallback({ statuses: finalUpdateList });
      } else if (type === 'froms') {
        froms = finalUpdateList;
        if (updateLeftMenuTaskUICallback) updateLeftMenuTaskUICallback({ froms: finalUpdateList });
        if (updateTaskEditorUICallback) updateTaskEditorUICallback({ froms: finalUpdateList });
      }
      await DB.putMeta(putMetaKey, finalUpdateList);
      // Removed the renderTaskListCallback() call here as it's handled by updateLeftMenuTaskUIState
      // if (renderTaskListCallback) await renderTaskListCallback(); // Re-render task list to reflect changes
    }
  });
}

/**
 * Validates a path segment for security.
 * Prevents directory traversal attempts.
 * @param {string} segment - The path segment to validate (e.g., username, task ID).
 * @returns {boolean} True if the segment is safe, false otherwise.
 */
function isValidPathSegment(segment) {
  // Disallow empty strings
  if (!segment) {
    return false;
  }
  // Check for directory traversal patterns
  if (segment.includes('..') || segment.includes('/') || segment.includes('\\')) {
    return false;
  }
  // Disallow segments starting with a dot (e.g., .hidden_file, .git)
  if (segment.startsWith('.')) {
    return false;
  }
  return true;
}


/**
 * Manages user authentication (login/logout).
 * @param {function} onUpdateUsernameCallback - Callback to update the username in the main UI module.
 */
async function manageAuthentication(onUpdateUsernameCallback) {
  const currentUsername = getAuthenticatedUsername(); // Get current authenticated username from apiService

  const modalTemplate = document.getElementById('modal-template');
  if (!modalTemplate) {
    console.error('Modal template not found.');
    return;
  }
  const modalClone = modalTemplate.content.cloneNode(true);
  const modalBackdrop = modalClone.querySelector('.modal-backdrop');
  const modalHeaderTitle = modalClone.querySelector('.modal-header h3');
  const modalBody = modalClone.querySelector('.modal-body');
  const saveBtn = modalClone.querySelector('.modal-save');
  const cancelBtn = modalClone.querySelector('.modal-cancel');
  const closeBtn = modalClone.querySelector('.modal-close');

  modalHeaderTitle.textContent = 'Login / Logout';

  let loginSectionHtml = '';
  let logoutSectionHtml = '';

  if (!currentUsername) {
    // Show login form if not logged in
    loginSectionHtml = `
      <p>Please log in to save and sync your tasks.</p>
      <div style="margin-top: 12px;">
          <label for="usernameInput" class="label">Username</label>
          <input type="text" id="usernameInput" placeholder="Enter your username" value="" class="w-full mt-1 p-2 border rounded">
      </div>
      <div style="margin-top: 12px;">
          <label for="passwordInput" class="label">Password</label>
          <input type="password" id="passwordInput" placeholder="Enter your password" class="w-full mt-1 p-2 border rounded">
      </div>
    `;
    saveBtn.textContent = 'Login'; // Change button text to Login
  } else {
    // Show logout confirmation if logged in
    logoutSectionHtml = `
      <p>You are currently logged in as: <strong>${escapeHtml(currentUsername)}</strong>.</p>
      <p>Are you sure you want to log out?</p>
      <button id="logoutConfirmBtn" class="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded mt-4">Log Out</button>
    `;
    saveBtn.style.display = 'none'; // Hide Save button for logout flow
  }

  modalBody.innerHTML = `
    <div class="auth-manager-container">
      ${loginSectionHtml}
      ${logoutSectionHtml}
    </div>
  `;

  document.body.appendChild(modalBackdrop);

  const usernameInput = modalBody.querySelector('#usernameInput');
  const passwordInput = modalBody.querySelector('#passwordInput');
  const logoutConfirmBtn = modalBody.querySelector('#logoutConfirmBtn');

  if (logoutConfirmBtn) {
    logoutConfirmBtn.addEventListener('click', async () => {
        logout(); // Call apiService logout
        username = null; // Update local state
        
        // Clear local lists
        categories = [];
        statuses = [];
        froms = [];

        // Clear lists in IndexedDB
        await DB.putMeta('categories', []);
        await DB.putMeta('statuses', []);
        await DB.putMeta('froms', []);

        if (onUpdateUsernameCallback) onUpdateUsernameCallback(null); // Update global UI state
        
        // Update UI components with cleared lists
        if (updateLeftMenuTaskUICallback) updateLeftMenuTaskUICallback({ categories, statuses, froms, selectedFilterCategories: [] });
        if (updateTaskEditorUICallback) updateTaskEditorUICallback({ categories, statuses, froms });
        if (updateMilestoneEditorUICallback) updateMilestoneEditorUICallback({ statuses });

        renderTaskList(); // Re-render task list after logout
        showModalAlert('Logged out successfully.');
        modalBackdrop.remove(); // Close modal
        updateSettingsDropdownVisibility();
    });
  }

  return new Promise(resolve => {
    const cleanupAndResolve = (actionPerformed) => {
      modalBackdrop.remove();
      resolve(actionPerformed);
    };

    saveBtn.onclick = async () => {
        // This block runs only if we're in the login flow
        const newUsername = usernameInput.value.trim();
        const newPassword = passwordInput.value;

        if (!newUsername) {
            showModalAlert('Username cannot be empty. Please enter a valid username.');
            return;
        }
        if (!isValidPathSegment(newUsername)) {
            showModalAlert('Invalid username. It cannot contain ".." or path separators like "/" or "\\", and cannot start with a ".".');
            return;
        }
        if (!newPassword) {
            showModalAlert('Password cannot be empty. Please enter a password.');
            return;
        }

        try {
            const loginResult = await login(newUsername, newPassword);
            // No longer need to save username to IndexedDB if it's purely server-managed
            // await DB.putMeta('username', loginResult.username);
            username = loginResult.username; // Update local state
            if (onUpdateUsernameCallback) onUpdateUsernameCallback(username); // Update global UI state
            await updateListsFromServer();
            renderTaskList(); // Re-render task list after login
            showModalAlert('Login successful!');
            cleanupAndResolve(true);
            updateSettingsDropdownVisibility();
        } catch (error) {
            showModalAlert(`Login failed: ${error.message}`);
        }
    };
    cancelBtn.onclick = () => cleanupAndResolve(false);
    closeBtn.onclick = () => cleanupAndResolve(false);
  });
}

async function updateListsFromServer() {
    const serverCategories = await getCategoriesFromServer();
    const serverStatuses = await getStatusesFromServer();
    const serverFroms = await getFromValuesFromServer();

    console.log(serverFroms)

    categories = [...new Set([...categories, ...serverCategories])];
    statuses = [...new Set([...statuses, ...serverStatuses])];
    froms = [...new Set([...froms, ...serverFroms])];

    await DB.putMeta('categories', categories);
    await DB.putMeta('statuses', statuses);
    await DB.putMeta('froms', froms);

    if (updateLeftMenuTaskUICallback) updateLeftMenuTaskUICallback({ categories, statuses, froms });
    if (updateTaskEditorUICallback) updateTaskEditorUICallback({ categories, statuses, froms });
    if (updateMilestoneEditorUICallback) updateMilestoneEditorUICallback({ statuses });
}

/**
 * Opens a modal for the user to select tasks for export, then exports the selected tasks.
 */
async function exportJSON() {
  // Get the current filters from the left menu
  const filters = getCurrentFilters();

  // Fetch a summary of the filtered tasks from the server
  let filteredTasksSummary = [];
  try {
    // We pass the filters, but also a very high limit to get all filtered tasks, ignoring pagination.
    filteredTasksSummary = await loadTasksSummaryFromServer(filters, { limit: 10000, offset: 0 });
  } catch (error) {
    console.error('Failed to load filtered task summaries for export:', error);
    showModalAlert('Error: Could not load filtered tasks from server for export.');
    return;
  }

  if (filteredTasksSummary.length === 0) {
    showModalAlert('No tasks to export based on the current filters.');
    return;
  }

  // Get the task export modal template and clone it
  const modalTemplate = document.getElementById('task-export-modal-template');
  if (!modalTemplate) {
    console.error('Task export modal template not found.');
    return;
  }
  const modalClone = modalTemplate.content.cloneNode(true);
  const modalBackdrop = modalClone.querySelector('.modal-backdrop');
  const taskSelectionList = modalClone.querySelector('#taskSelectionList');
  const selectAllBtn = modalClone.querySelector('#selectAllTasksBtn');
  const deselectAllBtn = modalClone.querySelector('#deselectAllTasksBtn');
  const exportSelectedBtn = modalClone.querySelector('#exportSelectedTasksBtn');
  const cancelBtn = modalClone.querySelector('.modal-cancel');
  const closeBtn = modalClone.querySelector('.modal-close');

  // Populate the task list with checkboxes using the summary data
  taskSelectionList.innerHTML = '';
  filteredTasksSummary.forEach(task => {
    const taskItem = document.createElement('div');
    taskItem.className = 'task-selection-item';
    taskItem.innerHTML = `
      <input type="checkbox" id="task-${task.id}" value="${task.id}" checked>
      <label for="task-${task.id}">${escapeHtml(task.title)}</label>
    `;
    taskSelectionList.appendChild(taskItem);
  });

  document.body.appendChild(modalBackdrop);

  const checkboxes = taskSelectionList.querySelectorAll('input[type="checkbox"]');

  selectAllBtn.addEventListener('click', () => {
    checkboxes.forEach(checkbox => checkbox.checked = true);
  });

  deselectAllBtn.addEventListener('click', () => {
    checkboxes.forEach(checkbox => checkbox.checked = false);
  });

  return new Promise(resolve => {
    const cleanupAndResolve = (result) => {
      modalBackdrop.remove();
      resolve(result);
    };

    exportSelectedBtn.onclick = async () => {
      const selectedTaskIds = Array.from(checkboxes)
                                .filter(cb => cb.checked)
                                .map(cb => cb.value);

      if (selectedTaskIds.length === 0) {
        showModalAlert('Please select at least one task to export.');
        return;
      }

      const tasksToExport = [];
      for (const taskId of selectedTaskIds) {
        try {
          // Fetch full task details and its milestones from the server
          const fullTask = await loadTaskFromServer(taskId);
          if (fullTask) {
            const milestones = await loadMilestonesForTaskFromServer(taskId);
            tasksToExport.push({ ...fullTask, milestones: milestones || [] });
          } else {
            console.warn(`Task '${taskId}' not found on server during export.`);
          }
        } catch (fetchError) {
          console.error(`Failed to fetch task '${taskId}' or its milestones from server for export:`, fetchError);
          showModalAlert(`Error fetching task '${taskId}' for export. Some data might be missing.`);
        }
      }

      const data = {
          tasks: tasksToExport,
          categories: categories, // Still export all categories/statuses/froms (from local state)
          statuses: statuses,
          froms: froms,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'selected-tasks-export.json';
      a.click();
      URL.revokeObjectURL(url);
      showModalAlert('Selected tasks exported successfully!');
      cleanupAndResolve(true); // Resolve with true indicating export was successful
    };

    cancelBtn.onclick = () => cleanupAndResolve(false);
    closeBtn.onclick = () => cleanupAndResolve(false); // Treat closing via 'x' as cancel
  });
}


/**
 * Imports tasks, categories, statuses, and froms from a JSON file.
 * Tasks and milestones will now be saved to the server.
 * @param {Event} e - The change event from the file input.
 */
async function importJSON(e) {
  const f = e.target.files[0];
  if (!f) return;
  const txt = await f.text();
  try {
    const j = JSON.parse(txt);

    // Update categories, statuses, froms lists in memory.
    // These are currently not synced to the server by this import,
    // as the server is mainly for tasks/milestones.
    // If these lists also need to be server-synced, additional API
    // endpoints would be required.
    if (j.categories) {
      categories.push(...j.categories);
      categories = [...new Set(categories)]; // Remove duplicates
      if (updateLeftMenuTaskUICallback) updateLeftMenuTaskUICallback({ categories: categories });
      if (updateTaskEditorUICallback) updateTaskEditorUICallback({ categories: categories });
      await DB.putMeta('categories', categories); // Still saving to IndexedDB for now
    }
    if (j.statuses) {
      statuses.push(...j.statuses);
      statuses = [...new Set(statuses)]; // Remove duplicate
      if (updateLeftMenuTaskUICallback) updateLeftMenuTaskUICallback({ statuses: statuses });
      if (updateTaskEditorUICallback) updateTaskEditorUICallback({ statuses: statuses });
      if (updateMilestoneEditorUICallback) updateMilestoneEditorUICallback({ statuses: statuses });
      await DB.putMeta('statuses', statuses); // Still saving to IndexedDB for now
    }
    if (j.froms) {
      froms.push(...j.froms);
      froms = [...new Set(froms)]; // Remove duplicate
      if (updateLeftMenuTaskUICallback) updateLeftMenuTaskUICallback({ froms: froms });
      if (updateTaskEditorUICallback) updateTaskEditorUICallback({ froms: froms });
      await DB.putMeta('froms', froms); // Still saving to IndexedDB for now
    }

    if (j.tasks) {
      for (const t of j.tasks) {
        try {
          // Temporarily extract milestones if they exist
          const milestonesToImport = t.milestones || [];
          // Remove milestones property from task before saving the task itself
          delete t.milestones;

          // Save task to server
          await saveTaskToServer(t);
          console.log(`Task '${t.id}' imported to server.`);

          // Save associated milestones to server
          for (const m of milestonesToImport) {
            await saveMilestoneToServer(m, t.id);
            console.log(`Milestone '${m.id}' for task '${t.id}' imported to server.`);
          }
        } catch (saveError) {
          console.error(`Failed to import task '${t.id}' or its milestones to server:`, saveError);
          showModalAlert(`Error importing task '${t.id}': ${saveError.message}. Some data might not be saved.`);
        }
      }
    }

    // Call callbacks provided by the main UI module
    if (renderTaskListCallback) await renderTaskListCallback();
    if (document.querySelector(selectors.settingsDropdown) && document.querySelector(selectors.settingsDropdown).classList.contains('show')) {
      document.querySelector(selectors.settingsDropdown).classList.remove('show');
    }

    showModalAlert('Import successful! Tasks and milestones are now saved on the server.');
  } catch (e) {
    console.error(e);
    showModalAlert('Error importing file. Please ensure it is a valid task export JSON.');
  } finally {
    // Clear the file input to allow selecting the same file again
    e.target.value = '';
  }
}
