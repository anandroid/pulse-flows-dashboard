// Content Labeling Admin - Table Version
class ContentLabelingTable {
    constructor() {
        this.table = null;
        this.contentData = [];
        this.labels = new Map();
        this.currentArea = '';
        
        this.initializeEventListeners();
        this.loadAreas();
        this.setDefaultDate();
    }

    initializeEventListeners() {
        $('#load-content').on('click', () => this.loadContent());
        $('#area-select').on('change', (e) => {
            this.currentArea = e.target.value;
            $('#submit-area').text(e.target.value || 'Area');
        });

        $('.bulk-action').on('click', (e) => {
            const action = $(e.target).data('action');
            this.handleBulkAction(action);
        });

        $('#submit-labels').on('click', () => this.submitLabels());
    }

    async loadAreas() {
        try {
            const response = await fetch('/api/flows/areas');
            const data = await response.json();
            
            const select = $('#area-select');
            select.empty().append('<option value="">Select an area...</option>');
            
            data.areas.forEach(area => {
                select.append(`<option value="${area.id}">${area.name}, ${area.region}</option>`);
            });
        } catch (error) {
            console.error('Failed to load areas:', error);
        }
    }

    setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        $('#date-select').val(today);
    }

    async loadContent() {
        const area = $('#area-select').val();
        const date = $('#date-select').val();
        const category = $('#category-filter').val();

        if (!area) {
            alert('Please select an area');
            return;
        }

        try {
            const params = new URLSearchParams({ area });
            if (date) params.append('date', date);
            if (category) params.append('category', category);

            const response = await fetch(`/api/flows/admin/content?${params}`);
            const data = await response.json();

            if (data.success) {
                this.contentData = data.content;
                this.renderTable();
                this.updateStats();
            } else {
                alert('Failed to load content: ' + data.error);
            }
        } catch (error) {
            console.error('Failed to load content:', error);
            alert('Failed to load content');
        }
    }

    renderTable() {
        // Destroy existing table if it exists
        if (this.table) {
            this.table.destroy();
            $('#content-table tbody').empty();
        }

        // Prepare data for DataTable
        const tableData = this.contentData.map(item => {
            const labels = this.labels.get(item.id) || {};
            
            return [
                '', // Checkbox column
                item.image_url || item.thumbnail_url || '',
                item.title,
                item.source,
                item.category,
                new Date(item.timestamp).toLocaleString(),
                labels.scope || '',
                labels.quality || '',
                labels.relevance || '',
                labels.trending || false,
                item // Store the full item data
            ];
        });

        // Initialize DataTable
        this.table = $('#content-table').DataTable({
            data: tableData,
            pageLength: 50,
            select: {
                style: 'multi',
                selector: 'td:first-child'
            },
            order: [[5, 'desc']], // Sort by date descending
            columns: [
                {
                    data: null,
                    defaultContent: '',
                    className: 'select-checkbox',
                    orderable: false,
                    width: '30px'
                },
                {
                    data: 1,
                    render: function(data) {
                        if (data) {
                            return `<img src="${data}" class="thumbnail" onerror="this.style.display='none'">`;
                        }
                        return '<div style="width:60px;height:60px;background:#f3f4f6;border-radius:4px;"></div>';
                    },
                    orderable: false,
                    width: '80px'
                },
                {
                    data: 2,
                    render: function(data, type, row) {
                        const item = row[10];
                        return `<div style="max-width: 300px;">
                            <div style="font-weight: 500;">${data}</div>
                            ${item.description ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${item.description.substring(0, 100)}...</div>` : ''}
                        </div>`;
                    }
                },
                { data: 3 },
                {
                    data: 4,
                    render: function(data) {
                        return `<span class="badge badge-category">${data}</span>`;
                    }
                },
                {
                    data: 5,
                    render: function(data) {
                        return new Date(data).toLocaleDateString();
                    }
                },
                {
                    data: 6,
                    render: function(data, type, row) {
                        const item = row[10];
                        const selected = data || '';
                        return `<select class="scope-select" data-id="${item.id}">
                            <option value="">-</option>
                            <option value="local" ${selected === 'local' ? 'selected' : ''}>Local</option>
                            <option value="national" ${selected === 'national' ? 'selected' : ''}>National</option>
                            <option value="hyperlocal" ${selected === 'hyperlocal' ? 'selected' : ''}>Hyper-local</option>
                        </select>`;
                    }
                },
                {
                    data: 7,
                    render: function(data, type, row) {
                        const item = row[10];
                        return `<input type="number" class="quality-input" data-id="${item.id}" 
                                value="${data || ''}" min="1" max="10" placeholder="1-10">`;
                    }
                },
                {
                    data: 8,
                    render: function(data, type, row) {
                        const item = row[10];
                        return `<input type="number" class="relevance-input" data-id="${item.id}" 
                                value="${data || ''}" min="1" max="10" placeholder="1-10">`;
                    }
                },
                {
                    data: 9,
                    render: function(data, type, row) {
                        const item = row[10];
                        return `<input type="checkbox" class="trending-checkbox" data-id="${item.id}" 
                                ${data ? 'checked' : ''}>`;
                    }
                }
            ],
            drawCallback: () => {
                // Re-attach event listeners after table redraw
                this.attachInputListeners();
            }
        });

        // Handle row selection events
        this.table.on('select deselect', () => {
            this.updateStats();
        });
    }

    attachInputListeners() {
        // Scope select
        $('.scope-select').off('change').on('change', (e) => {
            const id = $(e.target).data('id');
            const value = $(e.target).val();
            this.updateLabel(id, 'scope', value);
        });

        // Quality input
        $('.quality-input').off('change').on('change', (e) => {
            const id = $(e.target).data('id');
            const value = $(e.target).val();
            this.updateLabel(id, 'quality', value ? parseInt(value) : null);
        });

        // Relevance input
        $('.relevance-input').off('change').on('change', (e) => {
            const id = $(e.target).data('id');
            const value = $(e.target).val();
            this.updateLabel(id, 'relevance', value ? parseInt(value) : null);
        });

        // Trending checkbox
        $('.trending-checkbox').off('change').on('change', (e) => {
            const id = $(e.target).data('id');
            const value = $(e.target).is(':checked');
            this.updateLabel(id, 'trending', value);
        });
    }

    updateLabel(contentId, labelType, value) {
        if (!this.labels.has(contentId)) {
            this.labels.set(contentId, {});
        }

        const labels = this.labels.get(contentId);
        if (value === '' || value === null || value === false) {
            delete labels[labelType];
        } else {
            labels[labelType] = value;
        }

        this.updateStats();
    }

    handleBulkAction(action) {
        const selectedRows = this.table.rows({ selected: true }).data();
        
        selectedRows.each((row) => {
            const item = row[10];
            
            switch (action) {
                case 'mark-local':
                    this.updateLabel(item.id, 'scope', 'local');
                    // Update the select in the table
                    $(`.scope-select[data-id="${item.id}"]`).val('local');
                    break;
                    
                case 'mark-national':
                    this.updateLabel(item.id, 'scope', 'national');
                    // Update the select in the table
                    $(`.scope-select[data-id="${item.id}"]`).val('national');
                    break;
            }
        });
        
        this.updateStats();
    }

    updateStats() {
        const totalCount = this.contentData.length;
        const selectedCount = this.table ? this.table.rows({ selected: true }).count() : 0;
        
        let localCount = 0;
        let nationalCount = 0;
        let labeledCount = 0;

        this.labels.forEach((labels) => {
            if (Object.keys(labels).length > 0) {
                labeledCount++;
                if (labels.scope === 'local') localCount++;
                if (labels.scope === 'national') nationalCount++;
            }
        });

        $('#total-count').text(totalCount);
        $('#selected-count').text(selectedCount);
        $('#local-count').text(localCount);
        $('#national-count').text(nationalCount);

        // Enable/disable submit button
        $('#submit-labels').prop('disabled', labeledCount === 0);
    }

    async submitLabels() {
        const labeledItems = [];
        
        this.labels.forEach((labels, contentId) => {
            if (Object.keys(labels).length > 0) {
                labeledItems.push({
                    contentId: contentId,
                    labels: labels
                });
            }
        });

        if (labeledItems.length === 0) {
            alert('No items have been labeled');
            return;
        }

        if (!confirm(`Submit ${labeledItems.length} labeled items?`)) {
            return;
        }

        try {
            const response = await fetch('/api/flows/admin/labels', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    area: this.currentArea,
                    labels: labeledItems,
                    timestamp: new Date().toISOString()
                })
            });

            const data = await response.json();
            
            if (data.success) {
                alert(`Successfully submitted ${data.saved} labels!`);
                this.labels.clear();
                this.loadContent(); // Reload content
            } else {
                alert('Failed to submit labels: ' + data.error);
            }
        } catch (error) {
            console.error('Failed to submit labels:', error);
            alert('Failed to submit labels');
        }
    }
}

// Initialize on page load
$(document).ready(() => {
    new ContentLabelingTable();
});