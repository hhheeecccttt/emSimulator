import { getAllTypes } from './ObjectRegistry.js';
import { isPlacing, onPlacementClick, onPlacementRelease } from './PlacementGhost.js';

let ctxMenu = null;
let controls = null;
let wasPointerLocked = false;
let onPlacementStart = null;
let onObjectPlaced = null;

export function initContextMenu(controlsRef, placementCallback, placedCallback) {
    controls = controlsRef;
    onPlacementStart = placementCallback;
    onObjectPlaced = placedCallback;
    ctxMenu = document.getElementById('ctxMenu');
    populateMenu();
    setupEventListeners();
}

export function closeMenu() {
    ctxMenu.style.display = 'none';
    highlight(-1);
}

function populateMenu() {
    const submenu = document.getElementById('addSubmenu');
    submenu.innerHTML = '';
    for (const Cls of getAllTypes()) {
        const item = document.createElement('div');
        item.className = 'ctx-menu-item';
        item.dataset.action = 'add-' + Cls.id;
        item.textContent = Cls.label;
        submenu.appendChild(item);
    }
}

function setupEventListeners() {
    document.addEventListener('contextmenu', e => e.preventDefault());

    document.addEventListener('mousedown', e => {
        if (e.button !== 2) return;
        wasPointerLocked = !!document.pointerLockElement;
        if (wasPointerLocked) {
            document.exitPointerLock();
            const onMove = e2 => { showMenu(e2.clientX, e2.clientY); document.removeEventListener('mousemove', onMove); };
            document.addEventListener('mousemove', onMove);
        } else {
            showMenu(e.clientX, e.clientY);
        }
    });

    ctxMenu.addEventListener('click', e => {
        const item = e.target.closest('[data-action]');
        if (!item) return;
        const act = item.dataset.action;
        if (act.startsWith('add-')) {
            if (onPlacementStart) onPlacementStart(act.slice(4));
        } else {
            console.log(act + ' clicked');
        }
        closeMenu();
        if (wasPointerLocked) controls.lock();
    });

    ctxMenu.addEventListener('mousemove', () => { if (highlightedIdx() >= 0) highlight(-1); });

    document.addEventListener('keydown', e => {
        if (ctxMenu.style.display === 'none') return;
        const items = topItems();
        const idx = highlightedIdx();
        if (e.key === 'ArrowDown') { e.preventDefault(); highlight(Math.min(idx + 1, items.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(Math.max(idx - 1, 0)); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (idx >= 0) items[idx].click(); }
        else if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
    });

    document.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        if (isPlacing()) {
            const obj = onPlacementClick();
            if (obj && onObjectPlaced) onObjectPlaced(obj);
        }
    });

    document.addEventListener('mouseup', e => {
        if (e.button !== 0) return;
        const obj = onPlacementRelease();
        if (obj && onObjectPlaced) onObjectPlaced(obj);
    });

    document.addEventListener('click', e => {
        if (ctxMenu.style.display !== 'none' && !ctxMenu.contains(e.target)) {
            closeMenu();
            if (!document.pointerLockElement) controls.lock();
        }
    });
}

function showMenu(x, y) {
    ctxMenu.style.display = 'block';
    ctxMenu.style.left = (x - ctxMenu.offsetWidth / 2) + 'px';
    ctxMenu.style.top = (y - ctxMenu.offsetHeight / 2 - 10) + 'px';
    highlight(0);
}

function topItems() {
    return [...ctxMenu.children].filter(c => c.classList.contains('ctx-menu-item'));
}

function highlight(idx) {
    ctxMenu.querySelectorAll('.highlighted').forEach(el => el.classList.remove('highlighted'));
    const items = topItems();
    if (idx >= 0 && idx < items.length) items[idx].classList.add('highlighted');
}

function highlightedIdx() {
    return topItems().findIndex(el => el.classList.contains('highlighted'));
}
