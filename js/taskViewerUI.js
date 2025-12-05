// js/taskViewerUI.js
// This module manages the read-only task viewing area.

import { escapeHtml } from './utilUI.js';
import { Editor } from './editor.js'; // Import Editor for rendering static content
import { loadTaskFromServer } from './apiService.js'; // Import from centralized API service

// Internal state for the currently viewed task
let currentTask = null;
let openTaskEditorCallback = null; // Callback to open the task editor
let openMilestonesViewCallback = null; // Callback to open the milestone view
let closeViewerCallback = null; // Callback to close the viewer (for mobile UX)

const selectors = {
  viewerArea: '#viewerArea',
  viewTaskTitle: '#viewTaskTitle',
  viewTaskFrom: '#viewTaskFrom',
  viewTaskPriority: '#viewTaskPriority',
  viewTaskDeadline: '#viewTaskDeadline',
  viewTaskFinishDate: '#viewTaskFinishDate',
  viewTaskStatus: '#viewTaskStatus',
  viewTaskCreator: '#viewTaskCreator',
  viewDescContent: '#viewDescContent',
  viewNotesContent: '#viewNotesContent',
  viewCategoryList: '#viewCategoryList',
  viewAttachmentsList: '#viewAttachments',
  viewTaskDifficulty: '#viewTaskDifficulty',
  editTaskBtn: '#editTaskBtn',
  viewMilestonesBtn: '#viewMilestonesBtn',
  closeViewerBtn: '#closeTaskViewerBtn', // New selector for the close button
  appContainer: '#app', // Added for mobile UX
};

/**
 * Initializes the Task Viewer module.
 * @param {function} onOpenTaskEditor - Callback to open the task editor for editing.
 * @param {function} onOpenMilestonesView - Callback to open the milestone view for a task.
 * @param {function} onCloseViewer - Callback to close the viewer (for mobile UX)
 */
export function initTaskViewerUI(onOpenTaskEditor, onOpenMilestonesView, onCloseViewer) {
  openTaskEditorCallback = onOpenTaskEditor;
  openMilestonesViewCallback = onOpenMilestonesView;
  closeViewerCallback = onCloseViewer; // Initialize new callback
  // The event listeners for edit/view milestones will now be attached
  // directly to the buttons *after* they are rendered in openTaskViewer.
  // This ensures they are always active when the viewer content is updated.
}

/**
 * Opens the task viewer for a given task.
 * @param {object} task - The task object to view.
 */
export async function openTaskViewer(task, isNewTask = false) {
  // If description, notes, or attachments are missing, fetch the full task from the server
  if (!isNewTask && (!task.description || !task.notes || !task.attachments)) {
      const fullTask = await loadTaskFromServer(task.id); // Use centralized API service
      if (fullTask) {
          currentTask = fullTask; // Use the full task from the server
      } else {
          console.warn('Failed to load full task details from server for viewer. Displaying partial data.');
          currentTask = task; // Fallback to partial task if server load fails
      }
  } else {
      currentTask = task; // Use the provided task if it's already complete
  }

  const viewerArea = document.querySelector(selectors.viewerArea);
  if (!viewerArea) return;

  // Render the viewer content from the template
  const template = document.getElementById('task-viewer-template');
  const clone = document.importNode(template.content, true);
  viewerArea.innerHTML = ''; // Clear previous content
  viewerArea.appendChild(clone);

  console.log(currentTask)
  // Populate fields
  viewerArea.querySelector(selectors.viewTaskTitle).textContent = currentTask.title || 'No Title';
  viewerArea.querySelector(selectors.viewTaskFrom).textContent = currentTask.from || 'N/A';
  viewerArea.querySelector(selectors.viewTaskPriority).textContent = currentTask.priority || 'N/A';
  viewerArea.querySelector(selectors.viewTaskDifficulty).textContent = currentTask.difficulty || 'N/A';
  viewerArea.querySelector(selectors.viewTaskDeadline).textContent = currentTask.deadline ? new Date(currentTask.deadline).toLocaleDateString() : 'No Deadline';
  viewerArea.querySelector(selectors.viewTaskFinishDate).textContent = currentTask.finishDate ? new Date(currentTask.finishDate).toLocaleDateString() : 'Not Finished';
  viewerArea.querySelector(selectors.viewTaskStatus).textContent = currentTask.status || 'N/A';
  viewerArea.querySelector(selectors.viewTaskCreator).textContent = currentTask.creator || 'N/A';

  // Render rich text content
  const descContent = viewerArea.querySelector(selectors.viewDescContent);
  if (descContent) {
    Editor.renderStaticContent(descContent, currentTask.description || 'No description.');
  }
  const notesContent = viewerArea.querySelector(selectors.viewNotesContent);
  if (notesContent) {
    Editor.renderStaticContent(notesContent, currentTask.notes || 'No notes.');
  }

  renderCategoryTags();
  renderAttachments();

  // Attach event listeners to the buttons after they are appended to the DOM
  viewerArea.querySelector(selectors.editTaskBtn)?.addEventListener('click', () => {
    if (currentTask && openTaskEditorCallback) {
      openTaskEditorCallback(currentTask, isNewTask);
    }
  });

  viewerArea.querySelector(selectors.viewMilestonesBtn)?.addEventListener('click', () => {
    if (currentTask && openMilestonesViewCallback) {
      openMilestonesViewCallback(currentTask.id, currentTask.title);
    }
  });

  // Attach event listener for the new close button and place it beside the edit button
  const viewerHeader = viewerArea.querySelector('.viewer-header');
  const editTaskBtn = viewerArea.querySelector(selectors.editTaskBtn);
  if (viewerHeader && editTaskBtn) {
      const closeBtn = document.createElement('button');
      closeBtn.id = selectors.closeViewerBtn.substring(1); // Remove '#' from selector
      closeBtn.className = 'simple-close-btn'; // Use the new simple class
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', () => {
          if (closeViewerCallback) closeViewerCallback();
      });
      // Insert the close button right after the edit task button
      editTaskBtn.parentNode.insertBefore(closeBtn, editTaskBtn.nextSibling);
  }

  // Show the viewer and hide the editor
  viewerArea.style.display = 'grid'; // Use grid for viewer layout

  // Get references to the editor and placeholder elements
  const editorElement = document.querySelector('#editorArea .editor');
  const placeholderElement = document.querySelector('#editorArea #statistics-placeholder');

  // Only attempt to set display if the elements exist
  if (editorElement) {
    editorElement.style.display = 'none';
  }
  if (placeholderElement) {
    placeholderElement.style.display = 'none';
  }

  // On mobile, show the main content (viewer) and hide the sidebar
  const appContainer = document.querySelector(selectors.appContainer);
  if (window.innerWidth <= 768) {
    appContainer.classList.remove('sidebar-active', 'editor-active');
    appContainer.classList.add('viewer-active');
  }
}

/**
 * Renders the category tags for the current task in view mode.
 */
function renderCategoryTags() {
  const list = document.querySelector(selectors.viewCategoryList);
  if (!list) return;
  list.innerHTML = '';
  (currentTask.categories || []).forEach(cat => {
    const tag = document.createElement('div');
    tag.className = 'tag'; // No 'selected' class for view mode
    tag.textContent = escapeHtml(cat);
    list.appendChild(tag);
  });
  if ((currentTask.categories || []).length === 0) {
    list.textContent = 'No categories.';
    list.style.color = 'var(--muted)';
  } else {
    list.style.color = 'inherit';
  }
}

/**
 * Renders the attachments list for the current task in view mode.
 */
function renderAttachments(){
  const el = document.querySelector(selectors.viewAttachmentsList);
  if (!el) return;
  el.innerHTML = '';
  (currentTask.attachments || []).forEach(att => {
    const div = document.createElement('div'); div.className = 'attachment';
    const left = document.createElement('div'); left.textContent = att.name;
    const right = document.createElement('div');
    const dl = document.createElement('a'); dl.href = att.data; dl.download = att.name; dl.textContent = 'download';
    right.appendChild(dl);
    div.appendChild(left); div.appendChild(right); el.appendChild(div);
  });
  if ((currentTask.attachments || []).length === 0) {
    el.textContent = 'No attachments.';
    el.style.color = 'var(--muted)';
  } else {
    el.style.color = 'inherit';
  }
}

/**
 * Clears the viewer area and shows the placeholder.
 * This is useful when no task is selected or a task is deleted.
 */
export function clearViewerArea() {
  const viewerElement = document.querySelector(selectors.viewerArea);
  const editorElement = document.querySelector('#editorArea .editor');
  const placeholderElement = document.querySelector('#editorArea #statistics-placeholder');

  if (viewerElement) {
    viewerElement.style.display = 'none';
  }
  if (editorElement) {
    editorElement.style.display = 'none';
  }
  if (placeholderElement) {
    placeholderElement.style.display = 'block';
  } else {
    document.querySelector('#editorArea').innerHTML = '<div class="placeholder">Select or create a task to view/edit details</div>';
  }
  currentTask = null;

  // On mobile, if editor/viewer is closed, ensure sidebar is shown
  const appContainer = document.querySelector(selectors.appContainer);
  if (window.innerWidth <= 768) {
    appContainer.classList.remove('editor-active', 'viewer-active');
    appContainer.classList.add('sidebar-active'); // Show sidebar
  }
}
