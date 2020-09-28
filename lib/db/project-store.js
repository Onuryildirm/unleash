const NotFoundError = require('../error/notfound-error');
const {
    PROJECT_CREATED,
    PROJECT_UPDATED,
    PROJECT_DELETED,
} = require('../event-type');

const COLUMNS = ['id', 'name', 'description', 'created_at'];
const TABLE = 'projects';

class ProjectStore {
    constructor(db, eventStore, getLogger) {
        this.db = db;
        this.logger = getLogger('project-store.js');

        eventStore.on(PROJECT_CREATED, event => this.create(event.data));
        eventStore.on(PROJECT_UPDATED, event => this.update(event.data));
        eventStore.on(PROJECT_DELETED, event => this.delete(event.data));
    }

    fieldToRow(data) {
        return {
            id: data.id,
            name: data.name,
            description: data.description,
        };
    }

    async getAll() {
        const rows = await this.db
            .select(COLUMNS)
            .from(TABLE)
            .orderBy('name', 'asc');

        return rows.map(this.mapRow);
    }

    async get(id) {
        return this.db
            .first(COLUMNS)
            .from(TABLE)
            .where({ id })
            .then(this.mapRow);
    }

    async create(project) {
        await this.db(TABLE)
            .insert(this.fieldToRow(project))
            .catch(err =>
                this.logger.error('Could not insert project, error: ', err),
            );
    }

    async update(data) {
        try {
            await this.db(TABLE)
                .where({ id: data.id })
                .update(this.fieldToRow(data));
        } catch (err) {
            this.logger.error('Could not update project, error: ', err);
        }
    }

    async delete(id) {
        try {
            await this.db(TABLE)
                .where({ id })
                .del();
        } catch (err) {
            this.logger.error('Could not delete project, error: ', err);
        }
    }

    mapRow(row) {
        if (!row) {
            throw new NotFoundError('No project found');
        }

        return {
            id: row.id,
            name: row.name,
            description: row.description,
            createdAt: row.created_at,
        };
    }
}

module.exports = ProjectStore;
