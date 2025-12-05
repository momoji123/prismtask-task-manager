// js/taskEditorUI.js
// This module manages the main task editing area, including displaying,
// saving, deleting tasks, and handling task-specific categories and attachments.

// import { DB } from './storage.js'; // DB is no longer needed for task operations
import { Editor } from './editor.js';
import { escapeHtml, showModalAlert, showModalAlertConfirm } from './utilUI.js';
import { loadTaskFromServer, saveTaskToServer, deleteTaskFromServer } from './apiService.js'; // Import from centralized API service

// Internal state for the currently edited task and global options
let currentTask = null;
let categories = [];
let statuses = [];
let froms = [];
let currentUsername = null; // Added current username
let renderTaskListCallback = null; // Callback to re-render the task list after save/delete
let openMilestonesViewCallback = null; // Callback to open the milestone view
let openTaskViewerCallback = null; // New: Callback to open the task viewer
let closeEditorCallback = null; // Callback to close the editor (for mobile UX)

// Editor instances for description and notes
let descEditorInstance = null;
let notesEditorInstance = null;

const selectors = {
  editorArea: '#editorArea',
  taskEditor: '#editorArea .editor', // Selector for the task editor container
  taskTitleInput: '#taskTitle',
  taskFromSelect: '#taskFrom',
  taskPriorityInput: '#taskPriority',
  taskDeadlineInput: '#taskDeadline',
  taskFinishDateInput: '#taskFinishDate',
  taskStatusSelect: '#statusSelect',
  descEditor: '#descEditor',
  notesEditor: '#notesEditor',
  saveTaskBtn: '#saveBtn',
  deleteTaskBtn: '#deleteBtn',
  openMilestonesBtn: '#openMilestonesBtn',
  categoryList: '#categoryList',
  newCategorySelect: '#newCategorySelect',
  addCategoryBtn: '#addCategoryBtn',
  attachmentsList: '#attachments',
  viewerArea: '#viewerArea', // Add viewerArea selector
  closeEditorBtn: '#closeTaskEditorBtn', // New selector for the close button
  appContainer: '#app', // Added for mobile UX
};

/**
 * Initializes the Task Editor module.
 * @param {object} initialState - Object containing initial categories, statuses, froms, and username.
 * @param {function} onRenderTaskList - Callback to re-render the task list.
 * @param {function} onOpenMilestonesView - Callback to open the milestone view for a task.
 * @param {function} onOpenTaskViewer - New: Callback to open the task viewer for a task.
 * @param {function} onCloseEditor - Callback to close the editor (for mobile UX)
 */
export function initTaskEditorUI(initialState, onRenderTaskList, onOpenMilestonesView, onOpenTaskViewer, onCloseEditor) {
  categories = initialState.categories;
  statuses = initialState.statuses;
  froms = initialState.froms;
  currentUsername = initialState.username; // Initialize username
  renderTaskListCallback = onRenderTaskList;
  openMilestonesViewCallback = onOpenMilestonesView;
  openTaskViewerCallback = onOpenTaskViewer; // Initialize new callback
  closeEditorCallback = onCloseEditor; // Initialize new callback
}

/**
 * Updates the internal lists (categories, statuses, froms) and username.
 * This function is called from the main UI module when global state changes.
 * @param {object} updatedState - Object with updated lists and/or username.
 */
export function updateTaskEditorUIState(updatedState) {
  if (updatedState.categories) categories = updatedState.categories;
  if (updatedState.statuses) statuses = updatedState.statuses;
  if (updatedState.froms) froms = updatedState.froms;
  if (updatedState.username !== undefined) currentUsername = updatedState.username; // Update username

  // If the editor is open, re-render its dropdowns and update button states
  const editorContainer = document.querySelector(selectors.taskEditor);
  if (currentTask && editorContainer && editorContainer.style.display !== 'none') {
    // Re-render select elements if categories/statuses/froms changed
    if (editorContainer.contains(document.querySelector(selectors.taskFromSelect))) {
      renderFromOptions(editorContainer);
      renderStatusOptions(editorContainer);
      renderCategoryTags(); // Re-render categories assigned to the task
      renderNewCategoryDropdown(); // Re-render the "Add category" dropdown
    }
    updateButtonStates(editorContainer); // Update button states based on username
  }
}

/**
 * Updates the enabled/disabled state of action buttons based on the current username.
 * @param {HTMLElement} editorContainer - The container for the task editor.
 */
function updateButtonStates(editorContainer) {
  console.log("updateButtonStates")
  const saveBtn = editorContainer.querySelector(selectors.saveTaskBtn);
  const deleteBtn = editorContainer.querySelector(selectors.deleteTaskBtn);
  const openMilestonesBtn = editorContainer.querySelector(selectors.openMilestonesBtn);

  // Buttons are enabled only if a username is set AND the task's creator matches
  // or the task has no creator (meaning it's a new task that the current user will create)
  // If no currentUsername, all operations are disabled as authentication is required
  const canEditOrDelete = !!currentUsername && (currentTask && currentTask.creator === currentUsername || !currentTask.creator);
  console.log("currentUsername", currentUsername)
  console.log("currentTask.creator", currentTask.creator)

  if (saveBtn) {
    saveBtn.disabled = !canEditOrDelete;
  }
  if (deleteBtn) {
    // Delete is only enabled if the task exists and the current user is the creator
    deleteBtn.disabled = !(currentUsername && currentTask && currentTask.creator === currentUsername);
  }
  if (openMilestonesBtn) {
    // Milestones can only be opened if a username is set and the task has been saved (has a creator)
    openMilestonesBtn.disabled = !currentUsername || !currentTask || !currentTask.creator; 
  }

  // Set editability for rich text areas using their instances
  if (descEditorInstance) {
    descEditorInstance.setEditable(canEditOrDelete);
  }
  if (notesEditorInstance) {
    notesEditorInstance.setEditable(canEditOrDelete);
  }

  // For other inputs (not text-area)
  editorContainer.querySelectorAll('input, select').forEach(input => {
    input.disabled = !canEditOrDelete;
  });

  // Category add button
  const addCategoryBtn = editorContainer.querySelector(selectors.addCategoryBtn);
  const newCategorySelect = editorContainer.querySelector(selectors.newCategorySelect);
  if (addCategoryBtn) addCategoryBtn.disabled = !canEditOrDelete;
  if (newCategorySelect) newCategorySelect.disabled = !canEditOrDelete;

  // Attachment remove buttons
  editorContainer.querySelectorAll('.attachment button').forEach(button => {
    button.disabled = !canEditOrDelete;
  });
}

/**
 * Opens the task editor for a given task.
 * @param {object} task - The task object to edit.
 * @param {boolean} isNewTask - True if this is a new task being created.
 */
export async function openTaskEditor(task, isNewTask = false) {
  let fetchedTask = task; // Start with the provided task (could be a summary)

  // Always fetch the full task details from the server if it's an existing task,
  // to ensure we have description, notes, and attachments.
  if (!isNewTask && task.id) {
      try {
          // If task.creator is needed for auth, and not present, loadTaskFromServer might fail.
          // The server handles the creator check based on the JWT.
          const fullTask = await loadTaskFromServer(task.id);
          if (fullTask) {
              fetchedTask = fullTask;
          } else {
              showModalAlert('Failed to load full task details from server. Displaying partial data.');
              // Fallback to the partial task if server load fails, but acknowledge notes/desc might be missing
              fetchedTask = { ...task, description: '', notes: '', attachments: [] }; 
          }
      } catch (error) {
          console.error("Error fetching full task for editor:", error);
          showModalAlert(`Error loading task details: ${error.message}. Displaying partial data.`);
          // Fallback to the partial task if server load fails
          fetchedTask = { ...task, description: '', notes: '', attachments: [] };
      }
  }
  currentTask = fetchedTask;

  const editorArea = document.querySelector(selectors.editorArea);
  if (!editorArea) return;

  // Get references to viewer and placeholder
  const viewerElement = document.querySelector(selectors.viewerArea);
  const placeholderElement = document.querySelector(selectors.editorArea + ' #statistics-placeholder');

  // Hide viewer and placeholder explicitly
  if (viewerElement) {
    viewerElement.style.display = 'none';
  }
  if (placeholderElement) {
    placeholderElement.style.display = 'none';
  }

  // Create the main editor container if it doesn't exist, or re-use it if it does
  let editorContainer = editorArea.querySelector(selectors.taskEditor);
  if (!editorContainer) {
    editorContainer = document.createElement('div');
    editorContainer.className = 'editor'; // Match the selector '#editorArea .editor'
    editorArea.appendChild(editorContainer);
  }

  // Ensure the editor container is visible and clear its content for new rendering
  editorContainer.style.display = 'grid'; // Use grid for editor layout
  editorContainer.innerHTML = ''; // Clear previous editor content

  // Now, populate editorContainer with the task-specific HTML
  editorContainer.innerHTML = `
    <div class="card">
      <div class="modal-header" style="padding-bottom: 0; margin-bottom: 12px; border-bottom: none;">
        <h3>Edit Task</h3>
        <!-- Close button removed from here, now placed beside Save/Delete -->
      </div>
      <div class="label">Title</div>
      <input id="taskTitle" value="${escapeHtml(currentTask.title || '')}">
      <div class="label">From</div>
      <select id="taskFrom"></select>
      <div class="label">Priority (1-high,5-low)</div>
      <input id="taskPriority" type="number" min="1" max="5" value="${currentTask.priority || 3}">
      <div class="date-inputs">
        <div>
          <div class="label">Deadline</div>
          <input id="taskDeadline" type="date" value="${currentTask.deadline ? currentTask.deadline.split('T')[0]:''}">
        </div>
        <div>
          <div class="label">Finish Date</div>
          <input id="taskFinishDate" type="date" value="${currentTask.finishDate ? currentTask.finishDate.split('T')[0]:''}">
        </div>
      </div>
      <div class="label">Status</div>
      <select id="statusSelect"></select>
      <div class="label">Description</div>
      <div id="descEditor" class="card"></div>
      <div class="label">Notes</div>
      <div id="notesEditor" class="card"></div>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
        <button id="saveBtn">Save</button>
        <button id="deleteBtn">Delete</button>
        <button id="closeTaskEditorBtn" class="simple-close-btn">Close</button>
        <button id="openMilestonesBtn">Open Milestones</button>
      </div>
    </div>
    <aside class="card">
      <div class="label">Categories</div>
      <div id="categoryList"></div>
      <div style="margin-top:8px">
        <select id="newCategorySelect" class="w-full"></select>
        <button id="addCategoryBtn">Add</button>
      </div>
      <div class="label">Attachments</div>
      <div id="attachments" class="attach-list"></div>
    </aside>
  `;

  // Populate dropdowns using the new editorContainer
  renderFromOptions(editorContainer);
  renderStatusOptions(editorContainer);

  // This callback function will be passed to the editor.
  // When a file is attached in the editor, this function is called.
  const handleAttachment = (attachment) => {
    // Ensure the attachments array exists.
    if (!currentTask.attachments) {
      currentTask.attachments = [];
    }
    // Add the new attachment to the current task's attachments array.
    currentTask.attachments.push(attachment);
    // Re-render the attachments section to show the new file.
    renderAttachments();
  };

  // Initialize rich text editors and store their instances
  descEditorInstance = Editor.init(editorContainer.querySelector(selectors.descEditor), { onAttach: handleAttachment });
  editorContainer.querySelector(selectors.descEditor + ' .text-area').innerHTML = currentTask.description || '';

  notesEditorInstance = Editor.init(editorContainer.querySelector(selectors.notesEditor), { onAttach: handleAttachment });
  editorContainer.querySelector(selectors.notesEditor + ' .text-area').innerHTML = currentTask.notes || '';

  // Add event listeners for task actions
  editorContainer.querySelector(selectors.saveTaskBtn)?.addEventListener('click', saveTask);
  editorContainer.querySelector(selectors.deleteTaskBtn)?.addEventListener('click', deleteTask);
  editorContainer.querySelector(selectors.openMilestonesBtn)?.addEventListener('click', () => {
    // Check if task has a creator before opening milestones
    if (!currentTask.creator) {
      showModalAlert('Please save the task first to set its creator before managing milestones.');
      return;
    }
    if (openMilestonesViewCallback) openMilestonesViewCallback(currentTask.id, currentTask.title);
  });

  // Add event listener for the new close button
  editorContainer.querySelector(selectors.closeEditorBtn)?.addEventListener('click', () => {
    if (closeEditorCallback) closeEditorCallback();
  });


  renderCategoryTags();
  renderAttachments();
  renderNewCategoryDropdown();

  editorContainer.querySelector(selectors.addCategoryBtn)?.addEventListener('click', () => {
    const select = editorContainer.querySelector(selectors.newCategorySelect);
    const cat = select.value;
    if (!cat || cat === '__placeholder') return; // Check for placeholder value
    if (!currentTask.categories.includes(cat)) {
      currentTask.categories.push(cat);
      renderCategoryTags();
      renderNewCategoryDropdown(); // Re-render dropdown to remove added category
    }
    select.value = '__placeholder'; // Reset dropdown
  });

  updateButtonStates(editorContainer); // Call to set initial button states

  // On mobile, show the main content (editor) and hide the sidebar
  const appContainer = document.querySelector(selectors.appContainer);
  if (window.innerWidth <= 768) {
    appContainer.classList.remove('sidebar-active', 'viewer-active');
    appContainer.classList.add('editor-active');
  }
}

/**
 * Populates the 'From' select dropdown.
 * @param {HTMLElement} container - The container element (e.g., the editor div).
 */
function renderFromOptions(container) {
  const select = container.querySelector(selectors.taskFromSelect);
  if (select) {
    select.innerHTML = froms.map(f => `<option value="${escapeHtml(f)}" ${f === currentTask.from ? 'selected':''}>${escapeHtml(f)}</option>`).join('');
  }
}

/**
 * Populates the Status select dropdown.
 * @param {HTMLElement} container - The container element (e.g., the editor div).
 */
function renderStatusOptions(container) {
  const select = container.querySelector(selectors.taskStatusSelect);
  if (select) {
    select.innerHTML = statuses.map(s => `<option value="${escapeHtml(s)}" ${s === currentTask.status ? 'selected':''}>${escapeHtml(s)}</option>`).join('');
  }
}

/**
 * Saves the current task to the server.
 */
async function saveTask() {
  if (!currentTask) return;

  // Enforce username requirement
  if (!currentUsername) {
      showModalAlert('Please set your username in Settings before saving tasks.');
      return;
  }

  const editorContainer = document.querySelector(selectors.taskEditor);
  if (!editorContainer) return;

  currentTask.title = editorContainer.querySelector(selectors.taskTitleInput)?.value || '';
  currentTask.from = editorContainer.querySelector(selectors.taskFromSelect)?.value || '';
  currentTask.priority = parseInt(editorContainer.querySelector(selectors.taskPriorityInput)?.value, 10) || 3;
  currentTask.deadline = editorContainer.querySelector(selectors.taskDeadlineInput)?.value || null;
  currentTask.finishDate = editorContainer.querySelector(selectors.taskFinishDateInput)?.value || null;
  currentTask.status = editorContainer.querySelector(selectors.taskStatusSelect)?.value || '';
  currentTask.description = (descEditorInstance) ? descEditorInstance.getHTML() : '';
  currentTask.notes = (notesEditorInstance) ? notesEditorInstance.getHTML() : '';
  currentTask.updatedAt = new Date().toISOString();

  // Set creator if it's a new task (i.e., creator is null/undefined)
  if (!currentTask.creator) {
      currentTask.creator = currentUsername;
  } 

  try {
    await saveTaskToServer(currentTask); // Use centralized API service
    showModalAlert('Task saved!');
  } catch (error) {
    showModalAlert(`Error saving task: ${error.message}`);
  }

  if (renderTaskListCallback) await renderTaskListCallback(); // Re-render task list
  // After saving, go back to view mode
  if (openTaskViewerCallback) {
      openTaskViewerCallback(currentTask); // Pass the updated task to the viewer
  } else {
      // Fallback if viewer callback isn't set (shouldn't happen with proper init)
      openTaskEditor(currentTask); // Re-open editor to show updated state (e.g. updated date)
  }
}

/**
 * Deletes the current task from the server.
 */
async function deleteTask() {
  if (!currentTask) return;

  // Enforce username requirement and creator match
  if (!currentUsername || currentTask.creator !== currentUsername) {
      showModalAlert('You can only delete tasks created by you. Please set your username in Settings or select a task you created.');
      return;
  }

  const confirmed = await showModalAlertConfirm(`Are you sure you want to delete task "${escapeHtml(currentTask.title)}"? This will also delete all associated milestones.`);

  if (confirmed) {
    try {
      await deleteTaskFromServer(currentTask.id); // Use centralized API service

      // Call clearEditorArea to reset the UI safely
      clearEditorArea();
      currentTask = null; // Clear the current task
      if (renderTaskListCallback) await renderTaskListCallback(); // Re-render task list
      showModalAlert('Task deleted!');
    } catch (error) {
      showModalAlert(`Error deleting task: ${error.message}`);
    }
  }
}

/**
 * Renders the category tags for the current task.
 */
function renderCategoryTags() {
  const list = document.querySelector(selectors.categoryList);
  if (!list) return;
  list.innerHTML = '';
  // Check if currentTask.categories is defined before iterating
  (currentTask.categories || []).forEach((cat, idx) => {
    const tag = document.createElement('div');
    tag.className = 'tag selected';
    tag.innerHTML = `${escapeHtml(cat)}<button>x</button>`;
    // Disable remove button if current user is not the creator or no username is set
    const removeButton = tag.querySelector('button');
    if (removeButton) {
      const canEdit = (currentUsername && currentTask.creator === currentUsername) || !currentTask.creator;
      removeButton.disabled = !canEdit;
      if (canEdit) {
        removeButton.addEventListener('click', () => {
          currentTask.categories.splice(idx, 1);
          renderCategoryTags();
          renderNewCategoryDropdown(); // Re-render dropdown when a tag is removed
        });
      }
    }
    list.appendChild(tag);
  });
}

/**
 * Renders the dropdown for adding new categories to a task.
 */
function renderNewCategoryDropdown() {
  const select = document.querySelector(selectors.newCategorySelect);
  if (!select) return;

  // Filter out categories already assigned to the current task
  const availableCategories = categories.filter(cat => !currentTask.categories.includes(cat));

  select.innerHTML = '<option value="__placeholder" disabled selected>Add category...</option>' +
                     availableCategories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('\n');
  
  // Disable if not editable
  const addCategoryBtn = document.querySelector(selectors.addCategoryBtn);
  const canEdit = (currentUsername && currentTask.creator === currentUsername) || !currentTask.creator;
  select.disabled = !canEdit;
  if (addCategoryBtn) addCategoryBtn.disabled = !canEdit;
}


/**
 * Renders the attachments list for the current task.
 */
function renderAttachments(){
  const el = document.querySelector(selectors.attachmentsList);
  if (!el) return;
  el.innerHTML = '';
  const canEdit = currentUsername && currentTask.creator === currentUsername; // Check if current user is creator

  (currentTask.attachments || []).forEach((att, idx)=>{
    const div = document.createElement('div'); div.className = 'attachment';
    const left = document.createElement('div'); left.textContent = att.name;
    const right = document.createElement('div');
    const dl = document.createElement('a'); dl.href = att.data; dl.download = att.name; dl.textContent = 'download';
    const rm = document.createElement('button'); rm.textContent='remove'; 
    
    // Disable remove button based on permissions
    rm.disabled = !canEdit;
    if (canEdit) {
      rm.addEventListener('click', async ()=>{
        const confirmed = await showModalAlertConfirm(`Are you sure you want to remove "${escapeHtml(att.name)}"?`);
        if (confirmed) {
          currentTask.attachments.splice(idx,1);
          renderAttachments();
        }
      });
    }
    right.appendChild(dl); right.appendChild(document.createTextNode(' ')); right.appendChild(rm);
    div.appendChild(left); div.appendChild(right); el.appendChild(div);
  });
}

/**
 * Clears the editor area and shows the placeholder.
 * This is useful when no task is selected or a task is deleted.
 */
export function clearEditorArea() {
  // Get references to viewer, editor, and placeholder
  const viewerElement = document.querySelector(selectors.viewerArea);
  const editorElement = document.querySelector(selectors.taskEditor);
  const placeholderElement = document.querySelector(selectors.editorArea + ' #statistics-placeholder');

  // Hide viewer and editor explicitly if they exist
  if (viewerElement) {
    viewerElement.style.display = 'none';
  }
  if (editorElement) {
    editorElement.style.display = 'none';
  }

  // Show the placeholder, or create it if it doesn't exist (e.g., if editorArea was empty)
  if (placeholderElement) {
    placeholderElement.style.display = 'block';
  } else {
    document.querySelector(selectors.editorArea).innerHTML = '<div class="placeholder">Select or create a task to view/edit details</div>';
  }
  currentTask = null;
  // Clear editor instances when clearing the area
  descEditorInstance = null;
  notesEditorInstance = null;

  // On mobile, if editor/viewer is closed, ensure sidebar is shown
  const appContainer = document.querySelector(selectors.appContainer);
  if (window.innerWidth <= 768) {
    appContainer.classList.remove('editor-active', 'viewer-active');
    appContainer.classList.add('sidebar-active'); // Show sidebar
  }
}
