// ui.js
// This is the central UI orchestration module.
// It imports and initializes all component UI modules and manages shared application state.

import { DB } from './storage.js';
// Import all component UI modules
import * as HeaderUI from './headerUI.js';
import * as LeftMenuTaskUI from './leftMenuTaskUI.js';
import * as TaskEditorUI from './taskEditorUI.js';
import * as TaskViewerUI from './taskViewerUI.js'; // New: Import TaskViewerUI
import * as MilestoneGraphUI from './milestoneGraphUI.js';
import * as MilestoneEditorUI from './milestoneEditorUI.js';
import * as StatisticUI from './statisticUI.js';
import { showModalAlert } from './utilUI.js'; // Just for error/info modals

export const UI = (function() {
  // Application-wide state variables
  let categories = [];
  let statuses = [];
  let froms = [];
  let filterSectionVisible = true;
  let selectedFilterCategories = [];
  let selectedFilterStatuses = [];
  let username = null; // Added username state

  /**
   * Initializes the entire application UI.
   * This function is the main entry point for UI setup.
   */
  async function init() {
    // 1. Load custom options and application settings from DB
    // Ensure categories is always an array. 
    const storedCategories = await DB.getMeta('categories');
    categories = Array.isArray(storedCategories) ? storedCategories : [];

    statuses = (await DB.getMeta('statuses')) || [];
    froms = (await DB.getMeta('froms')) || [];
    filterSectionVisible = (await DB.getMeta('filterSectionVisible')) ?? true;
    selectedFilterCategories = (await DB.getMeta('selectedFilterCategories')) || [];
    selectedFilterStatuses = (await DB.getMeta('selectedFilterStatuses')) || [];
    username = (await DB.getMeta('username')) ||sessionStorage.getItem('authUsername') ||  null; // Load username

    // 2. Prepare initial state object for passing to components
    const commonState = {
      categories: categories,
      statuses: statuses,
      froms: froms,
      filterSectionVisible: filterSectionVisible,
      selectedFilterCategories: selectedFilterCategories,
      selectedFilterStatuses: selectedFilterStatuses,
      username: username // Pass username to common state
    };

    // Callback to update the username in UI's global state
    const updateUsernameInUI = (newUsername) => {
        username = newUsername;
        // Also update the state of modules that depend on username
        TaskEditorUI.updateTaskEditorUIState({ username: newUsername });
        MilestoneEditorUI.updateMilestoneEditorUIState({ username: newUsername });
    };

    // Define the close callbacks here, to be passed to relevant modules
    // These functions will be responsible for hiding the editor/viewer and showing the left menu
    const closeEditor = () => {
      TaskEditorUI.clearEditorArea(); // This also handles showing left menu on mobile
      LeftMenuTaskUI.clearTaskSelection();
    };

    const closeViewer = () => {
      TaskViewerUI.clearViewerArea(); // This also handles showing left menu on mobile
      LeftMenuTaskUI.clearTaskSelection();
    };


    // 3. Initialize individual UI components, passing necessary state and callbacks
    // Callbacks are crucial for inter-component communication without direct coupling.

    // HeaderUI needs: initial state, and callbacks to re-render task list, categories filter, and status options
    // Also pass callbacks to update other UI modules' states, and the new username update callback
    HeaderUI.initHeader(
      commonState,
      LeftMenuTaskUI.renderTaskList,
      LeftMenuTaskUI.renderFilterCategoriesMultiSelect,
      LeftMenuTaskUI.renderStatusOptions,
      LeftMenuTaskUI.updateLeftMenuTaskUIState,
      TaskEditorUI.updateTaskEditorUIState,
      MilestoneEditorUI.updateMilestoneEditorUIState,
      updateUsernameInUI // Pass the new callback
    );

    // LeftMenuTaskUI needs: initial state, and callbacks to open the task editor (for new tasks)
    // and the task viewer (for existing tasks).
    LeftMenuTaskUI.initLeftMenuTaskUI(commonState, TaskEditorUI.openTaskEditor, TaskViewerUI.openTaskViewer); // CHANGED

    // TaskEditorUI needs: initial state, and callbacks to re-render task list, open milestone view, and open task viewer
    // TaskEditorUI now gets a callback to open the viewer after saving a task
    // Pass the new closeEditor callback here
    TaskEditorUI.initTaskEditorUI(commonState, LeftMenuTaskUI.renderTaskList, MilestoneGraphUI.openMilestonesView, TaskViewerUI.openTaskViewer, closeEditor); // MODIFIED

    // TaskViewerUI needs: callback to open the task editor
    // TaskViewerUI also needs a callback to open milestone view
    // Pass the new closeViewer callback here
    TaskViewerUI.initTaskViewerUI(TaskEditorUI.openTaskEditor, MilestoneGraphUI.openMilestonesView, closeViewer); // MODIFIED

    // MilestoneGraphUI needs: callback to open the milestone editor
    MilestoneGraphUI.initMilestoneGraphUI(MilestoneEditorUI.openMilestoneEditor);

    // MilestoneEditorUI needs: initial state, and callbacks to re-render milestone bubbles, and update current milestone in graph
    MilestoneEditorUI.initMilestoneEditorUI(commonState, MilestoneGraphUI.renderMilestoneBubbles, MilestoneGraphUI.updateCurrentMilestone);

    StatisticUI.renderStatistics();

  }

  // Expose init function
  return { init };
})();

