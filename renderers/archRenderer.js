import { ArchNode } from '../models/ArchModels.js';

export class CoreSystem {
        constructor() {
            if (CoreSystem.instance) return CoreSystem.instance;
            CoreSystem.instance = this;

            this.nodes = new Map(); // Source of Truth
            this.archData = { nodes: new vis.DataSet([]), edges: new vis.DataSet([]) };
            this.network = null;
            this.currentSelection = null;
            this.currentAction = '';
        }

        init() {
            const container = document.getElementById('viz-architect');
            const options = {
                layout: { hierarchical: { direction: 'UD', sortMethod: 'directed', levelSeparation: 150, nodeSpacing: 200 } },
                physics: { enabled: false },
                interaction: { hover: true, dragView: true, zoomView: true, dragNodes: true, multiselect: false },
                nodes: { shape: 'box', font: { face: 'Courier New', color: '#fff' }, borderWidth: 2, margin: 10, color: { border: '#4ecdc4', background: '#222', highlight: { border: '#fff', background: '#444' } } },
                edges: { arrows: 'to', color: '#555', smooth: { type: 'cubicBezier' } }
            };

            this.network = new vis.Network(container, this.archData, options);

            // Events
            this.network.on("click", (p) => {
                if (p.nodes.length) this.selectNode(p.nodes[0]);
                else this.deselectAll();
            });

            this.network.on("doubleClick", (p) => {
                if (p.nodes.length) {
                    this.selectNode(p.nodes[0]);
                    this.triggerAction('edit');
                } else {
                    this.triggerAction('create_root');
                }
            });

            // Genesis Node
            this.createNode('n_genesis', "Root Project", "The starting point.");
        }

        // --- RENDER LOOP ---
        render() {
            const visNodes = [];
            const visEdges = [];

            this.nodes.forEach(n => {
                visNodes.push({ id: n.id, label: n.label, title: n.description });
                n.dependencies.forEach(dep => {
                    visEdges.push({ from: n.id, to: dep.id }); // Parent -> Child
                });
            });

            this.archData.nodes.clear();
            this.archData.nodes.add(visNodes);
            this.archData.edges.clear();
            this.archData.edges.add(visEdges);
            
            this.updateDock();
        }

        // --- ACTIONS ---
        selectNode(id) {
            this.currentSelection = id;
            this.network.selectNodes([id]);
            this.updateDock();
        }

        deselectAll() {
            this.currentSelection = null;
            this.network.unselectAll();
            this.updateDock();
        }

        updateDock() {
            const title = document.getElementById('dock-title');
            const sub = document.getElementById('dock-sub');
            const btns = document.querySelectorAll('.dock-btn');

            if (!title || !sub) return;

            if (this.currentSelection && this.nodes.has(this.currentSelection)) {
                const node = this.nodes.get(this.currentSelection);
                title.innerText = node.label;
                sub.innerText = "ID: " + node.id;
                btns.forEach(b => b.disabled = false);
            } else {
                title.innerText = "NO SELECTION";
                sub.innerText = "Double-click empty space";
                btns.forEach(b => b.disabled = true);
            }
        }

        createNode(id, label, desc = "") {
            const n = new ArchNode(id, label, desc);
            this.nodes.set(id, n);
            this.render();
            return n;
        }

        deleteNode() {
            if (!this.currentSelection) return;
            if (confirm("Delete this node? All connections will be severed.")) {
                const node = this.nodes.get(this.currentSelection);
                node.destroy(); // Clean OOP disconnect
                this.nodes.delete(this.currentSelection);
                this.deselectAll();
                this.render();
            }
        }

        // --- MODAL ---
        triggerAction(action) {
            this.currentAction = action;
            const modal = document.getElementById('modal-overlay');
            const title = document.getElementById('modal-title');
            const select = document.getElementById('inp-parents');
            
            document.getElementById('inp-label').value = "";
            document.getElementById('inp-desc').value = "";
            select.innerHTML = "";

            let currentNode = this.nodes.get(this.currentSelection);

            if (action === 'create_root') {
                title.innerText = "Create New Root";
                document.getElementById('group-lineage').style.display = 'none';
            } 
            else if (action === 'add_parent' || action === 'add_child') {
                title.innerText = action === 'add_parent' ? "Add Dependency (Parent)" : "Add Derivative (Child)";
                document.getElementById('group-lineage').style.display = 'none';
            } 
            else if (action === 'edit' && currentNode) {
                title.innerText = "Edit Node";
                document.getElementById('group-lineage').style.display = 'block';
                document.getElementById('inp-label').value = currentNode.label;
                document.getElementById('inp-desc').value = currentNode.description;

                // Populate Parents Select
                this.nodes.forEach(other => {
                    if (other.id === currentNode.id) return;
                    const opt = document.createElement('option');
                    opt.value = other.id;
                    opt.text = other.label;
                    if (currentNode.dependents.includes(other)) opt.selected = true;
                    select.appendChild(opt);
                });
            }

            modal.style.display = 'flex';
            document.getElementById('inp-label').focus();
        }

        submitModal() {
            const label = document.getElementById('inp-label').value || "Unnamed Node";
            const desc = document.getElementById('inp-desc').value;
            const id = (this.currentAction === 'edit') ? this.currentSelection : 'n_' + Date.now();

            let targetNode;

            if (this.currentAction === 'create_root') {
                targetNode = this.createNode(id, label, desc);
            } 
            else if (this.currentAction === 'add_parent') {
                targetNode = this.createNode(id, label, desc);
                const child = this.nodes.get(this.currentSelection);
                targetNode.addDependency(child); // New Node -> Selected Node
            } 
            else if (this.currentAction === 'add_child') {
                targetNode = this.createNode(id, label, desc);
                const parent = this.nodes.get(this.currentSelection);
                parent.addDependency(targetNode); // Selected Node -> New Node
            } 
            else if (this.currentAction === 'edit') {
                targetNode = this.nodes.get(id);
                targetNode.label = label;
                targetNode.description = desc;

                // Handle Graph Rewiring
                const select = document.getElementById('inp-parents');
                const selectedParentIds = Array.from(select.selectedOptions).map(o => o.value);

                // 1. Remove all existing parents
                [...targetNode.dependents].forEach(p => p.removeDependency(targetNode));

                // 2. Add selected parents
                selectedParentIds.forEach(pid => {
                    const newParent = this.nodes.get(pid);
                    if (newParent) newParent.addDependency(targetNode);
                });
            }

            document.getElementById('modal-overlay').style.display = 'none';
            this.render();
            
            // Auto-select newly created node
            if (this.currentAction !== 'edit') {
                setTimeout(() => this.selectNode(id), 100);
            }
        }
    }



export function rerend() { if (window.CoSy) window.CoSy.render(); }