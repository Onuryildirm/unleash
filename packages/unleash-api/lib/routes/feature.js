'use strict';

const BPromise = require('bluebird');
const logger = require('../logger');
const eventType = require('../event-type');
const NameExistsError = require('../error/name-exists-error');
const NotFoundError = require('../error/notfound-error');
const ValidationError = require('../error/validation-error.js');
const validateRequest = require('../error/validate-request');
const extractUser = require('../extract-user');

const legacyFeatureMapper = require('../helper/legacy-feature-mapper');
const version = 1;

module.exports = function (app, config) {
    const featureToggleStore = config.featureToggleStore;
    const eventStore = config.eventStore;

    app.get('/features', (req, res) => {
        featureToggleStore.getFeatures()
            .then((features) => features.map(legacyFeatureMapper.addOldFields))
            .then(features => res.json({ version, features }));
    });

    app.get('/features/:featureName', (req, res) => {
        featureToggleStore.getFeature(req.params.featureName)
            .then(legacyFeatureMapper.addOldFields)
            .then(feature => res.json(feature).end())
            .catch(() => res.status(404).json({ error: 'Could not find feature' }));
    });

    app.post('/features-validate', (req, res) => {
        req.checkBody('name', 'Name is required').notEmpty();
        req.checkBody('name', 'Name must match format ^[0-9a-zA-Z\\.\\-]+$').matches(/^[0-9a-zA-Z\\.\\-]+$/i);

        validateRequest(req)
            .then(validateFormat)
            .then(validateUniqueName)
            .then(() => res.status(201).end())
            .catch(NameExistsError, () => {
                res.status(403)
                    .json([{ msg: `A feature named '${req.body.name}' already exists.` }])
                    .end();
            })
            .catch(ValidationError, () => res.status(400).json(req.validationErrors()))
            .catch(err => {
                logger.error('Could not create feature toggle', err);
                res.status(500).end();
            });
    });

    app.post('/features', (req, res) => {
        req.checkBody('name', 'Name is required').notEmpty();
        req.checkBody('name', 'Name must match format ^[0-9a-zA-Z\\.\\-]+$').matches(/^[0-9a-zA-Z\\.\\-]+$/i);

        validateRequest(req)
            .then(validateFormat)
            .then(validateUniqueName)
            .then(() => eventStore.store({
                type: eventType.featureCreated,
                createdBy: extractUser(req),
                data: legacyFeatureMapper.toNewFormat(req.body),
            }))
            .then(() => res.status(201).end())
            .catch(NameExistsError, () => {
                res.status(403)
                    .json([{ msg: `A feature named '${req.body.name}' already exists.` }])
                    .end();
            })
            .catch(ValidationError, () => res.status(400).json(req.validationErrors()))
            .catch(err => {
                logger.error('Could not create feature toggle', err);
                res.status(500).end();
            });
    });

    app.put('/features/:featureName', (req, res) => {
        const featureName    = req.params.featureName;
        const userName       = extractUser(req);
        const updatedFeature = legacyFeatureMapper.toNewFormat(req.body);

        updatedFeature.name = featureName;

        featureToggleStore.getFeature(featureName)
            .then(() => eventStore.store({
                type: eventType.featureUpdated,
                createdBy: userName,
                data: updatedFeature,
            }))
            .then(() => res.status(200).end())
            .catch(NotFoundError, () =>  res.status(404).end())
            .catch(err => {
                logger.error(`Could not update feature toggle=${featureName}`, err);
                res.status(500).end();
            });
    });

    app.delete('/features/:featureName', (req, res) => {
        const featureName    = req.params.featureName;
        const userName       = extractUser(req);

        featureToggleStore.getFeature(featureName)
            .then(() => eventStore.store({
                type: eventType.featureArchived,
                createdBy: userName,
                data: {
                    name: featureName,
                },
            }))
            .then(() => res.status(200).end())
            .catch(NotFoundError, () => res.status(404).end())
            .catch(err => {
                logger.error(`Could not archive feature=${featureName}`, err);
                res.status(500).end();
            });
    });

    function validateUniqueName (req) {
        return new BPromise((resolve, reject) => {
            featureToggleStore.getFeature(req.body.name)
                .then(() => {
                    reject(new NameExistsError('Feature name already exist'));
                }, () => {
                    resolve(req);
                });
        });
    }

    function validateFormat (req) {
        if (req.body.strategy && req.body.strategies) {
            return BPromise.reject(new ValidationError('Cannot use both "strategy" and "strategies".'));
        }

        return BPromise.resolve(req);
    }
};