// js/statisticUI.js
import { DB } from './storage.js';
import * as apiService from './apiService.js';
import { openTaskViewer } from './taskViewerUI.js';

const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
const threeWeeksInMs = 21 * 24 * 60 * 60 * 1000;

let allTasks = [];

function getDueSoonAndOverdueTasks(tasks) {
    const dueSoon = [];
    const overdue = [];
    const now = new Date();

    for (const task of tasks) {
        if (task.deadline) {
            const deadline = new Date(task.deadline);
            const diff = deadline - now;

            if (diff > 0 && diff <= sevenDaysInMs) {
                dueSoon.push(task);
            } else if (diff < 0 && !task.finishDate) {
                overdue.push(task);
            }
        }
    }
    return { dueSoon, overdue };
}

function getRecentlyUpdatedTasks(tasks) {
    const recentlyUpdated = [];
    const now = new Date();

    for (const task of tasks) {
        if (task.updatedAt) {
            const updatedAt = new Date(task.updatedAt);
            const diff = now - updatedAt;

            if (diff <= threeWeeksInMs) {
                recentlyUpdated.push(task);
            }
        }
    }
    return recentlyUpdated;
}

function getRecentlyFinishedTasks(tasks) {
    const recentlyFinished = [];
    const now = new Date();

    for (const task of tasks) {
        if (task.finishDate) {
            const finishDate = new Date(task.finishDate);
            const diff = now - finishDate;


            if (diff <= threeWeeksInMs) {
                recentlyFinished.push(task);
            }
        }
    }
    return recentlyFinished;
}

function groupTasksByWeek(tasks, dateField) {
    const now = new Date();
    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;
    const groupedTasks = {
        "Week 1 (last 7 days)": [],
        "Week 2 (7-14 days ago)": [],
        "Week 3 (14-21 days ago)": []
    };

    for (const task of tasks) {
        if (task[dateField]) {
            const taskDate = new Date(task[dateField]);
            const diff = now - taskDate;

            if (diff <= oneWeekInMs) {
                groupedTasks["Week 1 (last 7 days)"].push(task);
            } else if (diff <= oneWeekInMs * 2) {
                groupedTasks["Week 2 (7-14 days ago)"].push(task);
            } else if (diff <= oneWeekInMs * 3) {
                groupedTasks["Week 3 (14-21 days ago)"].push(task);
            }
        }
    }
    return groupedTasks;
}

function renderWeeklyTaskList(groupedTasks, showDeadline, showFinishDate, showUpdatedDate) {
    let html = '';
    for (const week in groupedTasks) {
        if (groupedTasks[week].length > 0) {
            html += `
                <details open>
                    <summary>${week}</summary>
                    ${renderTaskList(groupedTasks[week], showDeadline, showFinishDate, showUpdatedDate)}
                </details>
            `;
        }
    }
    return html || '<div>Nothing to show.</div>';
}


function renderTaskList(tasks, showDeadline = true, showFinishDate = true, showUpdatedDate = true) {
    if (!tasks || tasks.length === 0) {
        return '<div>Nothing to show.</div>';
    }

    
    
    if (showDeadline) {
        tasks.sort((b, a) => {
            const dateA = a.deadline ? new Date(a.deadline).getTime() : 0;
            const dateB = b.deadline ? new Date(b.deadline).getTime() : 0;
            return dateA - dateB;
        });
    }
    
    if (showFinishDate) {
        tasks.sort((b, a) => {
            const dateA = a.finishDate ? new Date(a.finishDate).getTime() : 0;
            const dateB = b.finishDate ? new Date(b.finishDate).getTime() : 0;
            return dateA - dateB;
        });
    }
    
    if (showUpdatedDate) {
        tasks.sort((b, a) => {
            const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return dateA - dateB;
        });
    }
    
    
    let listItems = tasks.map(task => {
        let deadlineText = showDeadline && task.deadline ? ` (Deadline: ${new Date(task.deadline).toLocaleDateString()})` : '';
        let finishDateText = showFinishDate && task.finishDate ? ` (Finished: ${new Date(task.finishDate).toLocaleDateString()})` : '';
        let updatedDateText = showUpdatedDate && task.updatedAt ? ` (Updated: ${new Date(task.updatedAt).toLocaleDateString()})` : '';

        return `<li class="clickable-task" data-task-id="${task.id}">${task.title}${deadlineText}${finishDateText}${updatedDateText}</li>`;
    }).join('');
    

    return `
        <ul>
            ${listItems}
        </ul>
    `;
}

function handleTaskListClick(event) {
    const target = event.target.closest('.clickable-task');
    if (target) {
        const taskId = target.dataset.taskId;
        const task = allTasks.find(t => t.id === taskId);
        if (task) {
            openTaskViewer(task);
        }
    }
}

export async function renderStatistics() {
    const placeholder = document.getElementById('statistics-placeholder');
    if (!placeholder) return;

    try {
        const statuses = await DB.getMeta('statuses');
        const taskCounts = await apiService.getTaskCounts();

        let now = new Date();

        
        const taskWithDeadline = await apiService.loadTasksSummaryFromServer({
            deadlineRT: new Date(now.getTime() + sevenDaysInMs).toISOString().split('T')[0],
            hasFinishDate: false
        }, { limit: 100 });

        const updatedTasks = await apiService.loadTasksSummaryFromServer({
            updatedRF: new Date(now.getTime() - threeWeeksInMs).toISOString().split('T')[0]
        }, { limit: 100 });

        const finishedTask = await apiService.loadTasksSummaryFromServer({
            finishedRF: new Date(now.getTime() - threeWeeksInMs).toISOString().split('T')[0]
        }, { limit: 100 });

        allTasks = [...taskWithDeadline, ...updatedTasks, ...finishedTask];

        const { dueSoon, overdue } = getDueSoonAndOverdueTasks(taskWithDeadline);
        const recentlyUpdated = getRecentlyUpdatedTasks(updatedTasks);
        const recentlyFinished = getRecentlyFinishedTasks(finishedTask);

        const weeklyUpdated = groupTasksByWeek(recentlyUpdated, 'updatedAt');
        const weeklyFinished = groupTasksByWeek(recentlyFinished, 'finishDate');

        let statisticsHTML = `
            <div class="statistics-section">
                <div class="viewer-header">
                    <h2>Statistics</h2>
                    <button id="refresh-statistics-btn" class="action-btn">Refresh</button>
                </div>

                <div class="statistic-widget">
                    <h3>Task Counts by Status</h3>
                    <ul>
                        ${statuses.map(status => `<li><strong>${status}:</strong> ${taskCounts[status] || 0}</li>`).join('')}
                    </ul>
                </div>

                <div class="statistic-widget task-list-widget">
                    <h3>Due Soon (<= 7 days)</h3>
                    ${renderTaskList(dueSoon, true, false, false)}
                </div>

                <div class="statistic-widget task-list-widget">
                    <h3>Overdue Tasks</h3>
                    ${renderTaskList(overdue, true, false, false)}
                </div>

                <div class="statistic-widget task-list-widget">
                    <h3>Progress Last 3 Week (updated in last 21 days)</h3>
                    ${renderWeeklyTaskList(weeklyUpdated, false, false, true)}
                </div>

                <div class="statistic-widget task-list-widget">
                    <h3>Finished Last 3 Week</h3>
                    ${renderWeeklyTaskList(weeklyFinished, false, true, false)}
                </div>
            </div>
        `;

        placeholder.innerHTML = statisticsHTML;

        const refreshButton = document.getElementById('refresh-statistics-btn');
        if (refreshButton) {
            refreshButton.addEventListener('click', renderStatistics);
        }

        document.querySelectorAll('.task-list-widget').forEach(widget => {
            widget.addEventListener('click', handleTaskListClick);
        });

    } catch (error) {
        console.error('Failed to render statistics:', error);
        placeholder.innerHTML = '<div class="error">Failed to load statistics. <button id="refresh-statistics-btn" class="action-btn">Refresh</button></div>';
        const refreshButton = document.getElementById('refresh-statistics-btn');
        if (refreshButton) {
            refreshButton.addEventListener('click', renderStatistics);
        }
    }
}
