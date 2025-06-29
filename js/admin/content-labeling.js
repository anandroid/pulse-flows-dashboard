// Content Labeling Admin Interface
class ContentLabelingAdmin {
    constructor() {
        this.selectedItems = new Set();
        this.contentData = [];
        this.labels = new Map(); // contentId -> labels
        this.currentArea = '';
        
        this.initializeEventListeners();
        this.loadAreas();
        this.setDefaultDate();
    }

    initializeEventListeners() {
        // Area and filter controls
        document.getElementById('load-content').addEventListener('click', () => this.loadContent());
        document.getElementById('area-select').addEventListener('change', (e) => {
            this.currentArea = e.target.value;
            document.getElementById('submit-area').textContent = e.target.value || 'Area';
        });

        // Bulk actions
        document.querySelectorAll('.bulk-action').forEach(button => {
            button.addEventListener('click', (e) => this.handleBulkAction(e.target.dataset.action));
        });

        // Submit button
        document.getElementById('submit-labels').addEventListener('click', () => this.submitLabels());
    }

    async loadAreas() {
        try {
            const response = await fetch('/api/flows/areas');
            const data = await response.json();
            
            const select = document.getElementById('area-select');
            select.innerHTML = '<option value="">Select an area...</option>';
            
            data.areas.forEach(area => {
                const option = document.createElement('option');
                option.value = area.id;
                option.textContent = `${area.name}, ${area.region}`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to load areas:', error);
        }
    }

    setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('date-select').value = today;
    }

    async loadContent() {
        const area = document.getElementById('area-select').value;
        const date = document.getElementById('date-select').value;
        const category = document.getElementById('category-filter').value;

        if (!area) {
            alert('Please select an area');
            return;
        }

        this.showLoading(true);

        try {
            const params = new URLSearchParams({
                area,
                date,
                ...(category && { category })
            });

            const response = await fetch(`/api/flows/admin/content?${params}`);
            const data = await response.json();

            this.contentData = data.content || [];
            this.renderContent();
            this.updateStats();
        } catch (error) {
            console.error('Failed to load content:', error);
            alert('Failed to load content');
        } finally {
            this.showLoading(false);
        }
    }

    renderContent() {
        const container = document.getElementById('content-container');
        container.innerHTML = '';

        this.contentData.forEach(item => {
            const card = this.createContentCard(item);
            container.appendChild(card);
        });
    }

    createContentCard(item) {
        const div = document.createElement('div');
        div.className = 'content-card bg-white rounded-lg shadow-sm p-4 cursor-pointer';
        div.dataset.contentId = item.id;

        const labels = this.labels.get(item.id) || {};
        const isSelected = this.selectedItems.has(item.id);
        
        if (isSelected) {
            div.classList.add('selected');
        }

        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div class="flex-1">
                    <h3 class="text-lg font-medium text-gray-900 line-clamp-2">${item.title}</h3>
                    <p class="text-sm text-gray-500 mt-1">
                        <span class="font-medium">${item.source}</span> • 
                        ${new Date(item.timestamp).toLocaleString()} •
                        <span class="label-badge bg-gray-100 text-gray-800">${item.category}</span>
                    </p>
                </div>
                ${item.image_url || item.thumbnail_url ? `
                    <img src="${item.image_url || item.thumbnail_url}" 
                         alt="" 
                         class="w-24 h-24 object-cover rounded ml-4">
                ` : ''}
            </div>

            <p class="text-gray-600 text-sm mb-3 line-clamp-2">${item.description || ''}</p>

            <div class="border-t pt-3">
                <div class="flex flex-wrap gap-2 mb-2">
                    ${labels.scope ? `
                        <span class="label-badge ${labels.scope === 'local' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}">
                            ${labels.scope}
                        </span>
                    ` : ''}
                    ${labels.quality ? `
                        <span class="label-badge bg-green-100 text-green-800">
                            Quality: ${labels.quality}/10
                        </span>
                    ` : ''}
                    ${labels.trending ? `
                        <span class="label-badge bg-yellow-100 text-yellow-800">
                            Trending
                        </span>
                    ` : ''}
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                        <label class="text-xs text-gray-500">Scope</label>
                        <select class="label-select w-full text-sm border rounded px-2 py-1" 
                                data-content-id="${item.id}" 
                                data-label="scope">
                            <option value="">-</option>
                            <option value="local" ${labels.scope === 'local' ? 'selected' : ''}>Local</option>
                            <option value="national" ${labels.scope === 'national' ? 'selected' : ''}>National</option>
                            <option value="hyperlocal" ${labels.scope === 'hyperlocal' ? 'selected' : ''}>Hyper-local</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="text-xs text-gray-500">Quality (1-10)</label>
                        <input type="number" 
                               class="label-input w-full text-sm border rounded px-2 py-1" 
                               data-content-id="${item.id}" 
                               data-label="quality"
                               min="1" max="10" 
                               value="${labels.quality || ''}"
                               placeholder="1-10">
                    </div>
                    
                    <div>
                        <label class="text-xs text-gray-500">Relevance (1-10)</label>
                        <input type="number" 
                               class="label-input w-full text-sm border rounded px-2 py-1" 
                               data-content-id="${item.id}" 
                               data-label="relevance"
                               min="1" max="10" 
                               value="${labels.relevance || ''}"
                               placeholder="1-10">
                    </div>
                    
                    <div class="flex items-end">
                        <label class="flex items-center">
                            <input type="checkbox" 
                                   class="label-checkbox mr-2" 
                                   data-content-id="${item.id}" 
                                   data-label="trending"
                                   ${labels.trending ? 'checked' : ''}>
                            <span class="text-sm">Good for Trending</span>
                        </label>
                    </div>
                </div>
            </div>
        `;

        // Event listeners
        div.addEventListener('click', (e) => {
            if (!e.target.closest('.label-select, .label-input, .label-checkbox')) {
                this.toggleSelection(item.id);
            }
        });

        // Label change listeners
        div.querySelectorAll('.label-select, .label-input').forEach(input => {
            input.addEventListener('change', (e) => this.updateLabel(e));
        });

        div.querySelectorAll('.label-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => this.updateLabel(e));
        });

        return div;
    }

    toggleSelection(contentId) {
        if (this.selectedItems.has(contentId)) {
            this.selectedItems.delete(contentId);
        } else {
            this.selectedItems.add(contentId);
        }
        
        const card = document.querySelector(`[data-content-id="${contentId}"]`);
        card.classList.toggle('selected');
        
        this.updateStats();
    }

    updateLabel(event) {
        const contentId = event.target.dataset.contentId;
        const labelType = event.target.dataset.label;
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;

        if (!this.labels.has(contentId)) {
            this.labels.set(contentId, {});
        }

        const labels = this.labels.get(contentId);
        if (value === '' || value === false) {
            delete labels[labelType];
        } else {
            labels[labelType] = value;
        }

        this.updateStats();
    }

    handleBulkAction(action) {
        switch (action) {
            case 'select-all':
                this.contentData.forEach(item => {
                    this.selectedItems.add(item.id);
                    document.querySelector(`[data-content-id="${item.id}"]`).classList.add('selected');
                });
                break;
                
            case 'deselect-all':
                this.selectedItems.clear();
                document.querySelectorAll('.content-card').forEach(card => {
                    card.classList.remove('selected');
                });
                break;
                
            case 'mark-local':
                this.selectedItems.forEach(id => {
                    this.updateLabelForItem(id, 'scope', 'local');
                });
                break;
                
            case 'mark-national':
                this.selectedItems.forEach(id => {
                    this.updateLabelForItem(id, 'scope', 'national');
                });
                break;
        }
        
        this.updateStats();
    }

    updateLabelForItem(contentId, labelType, value) {
        if (!this.labels.has(contentId)) {
            this.labels.set(contentId, {});
        }
        this.labels.get(contentId)[labelType] = value;
        
        // Update UI
        const input = document.querySelector(`[data-content-id="${contentId}"][data-label="${labelType}"]`);
        if (input) {
            if (input.type === 'checkbox') {
                input.checked = value;
            } else {
                input.value = value;
            }
        }
        
        // Update visual indicators
        this.renderContent();
    }

    updateStats() {
        document.getElementById('total-count').textContent = this.contentData.length;
        document.getElementById('selected-count').textContent = this.selectedItems.size;
        
        let localCount = 0;
        let nationalCount = 0;
        let labeledCount = 0;
        
        this.labels.forEach((labels) => {
            if (Object.keys(labels).length > 0) {
                labeledCount++;
            }
            if (labels.scope === 'local' || labels.scope === 'hyperlocal') {
                localCount++;
            } else if (labels.scope === 'national') {
                nationalCount++;
            }
        });
        
        document.getElementById('local-count').textContent = localCount;
        document.getElementById('national-count').textContent = nationalCount;
        document.getElementById('labeled-count').textContent = labeledCount;
        
        // Enable/disable submit button
        const submitButton = document.getElementById('submit-labels');
        submitButton.disabled = labeledCount === 0;
    }

    async submitLabels() {
        if (this.labels.size === 0) {
            alert('No labels to submit');
            return;
        }

        const labelData = [];
        this.labels.forEach((labels, contentId) => {
            if (Object.keys(labels).length > 0) {
                const content = this.contentData.find(item => item.id === contentId);
                labelData.push({
                    contentId,
                    area: this.currentArea,
                    labels,
                    content: {
                        title: content.title,
                        description: content.description,
                        category: content.category,
                        source: content.source,
                        timestamp: content.timestamp
                    }
                });
            }
        });

        if (!confirm(`Submit ${labelData.length} labeled items for ${this.currentArea}?`)) {
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch('/api/flows/admin/labels', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    area: this.currentArea,
                    labels: labelData,
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error('Failed to submit labels');
            }

            const result = await response.json();
            alert(`Successfully submitted ${result.saved} labels!`);
            
            // Clear labels and selections
            this.labels.clear();
            this.selectedItems.clear();
            this.renderContent();
            this.updateStats();
            
        } catch (error) {
            console.error('Failed to submit labels:', error);
            alert('Failed to submit labels');
        } finally {
            this.showLoading(false);
        }
    }

    showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ContentLabelingAdmin();
});