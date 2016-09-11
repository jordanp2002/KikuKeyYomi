/*
 * Copyright (C) 2016  Alex Yatskov <alex@foosoft.net>
 * Author: Alex Yatskov <alex@foosoft.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


class Translator {
    constructor() {
        this.loaded = false;
        this.tagMeta = null;
        this.dictionary = new Dictionary();
        this.deinflector = new Deinflector();
    }

    loadData({loadEnamDict=true}, callback) {
        if (this.loaded) {
            callback();
            return;
        }

        loadJson('bg/data/rules.json').then(rules => {
            this.deinflector.setRules(rules);
            return loadJson('bg/data/tags.json');
        }).then(tagMeta => {
            this.tagMeta = tagMeta;
            return this.dictionary.existsDb();
        }).then(exists => {
            this.dictionary.initDb();
            if (exists) {
                return Promise.resolve();
            }

            return Promise.all([
                this.dictionary.importKanjiDict('bg/data/kanjidic/index.json'),
                this.dictionary.importTermDict('bg/data/edict/index.json'),
                this.dictionary.importTermDict('bg/data/enamdict/index.json')
            ]);
        }).then(() => {
            this.loaded = true;
            callback();
        });
    }

    findTermGroups(text) {
        const groups = {};
        const promises = [];

        for (let i = text.length; i > 0; --i) {
            promises.append(
                this.deinflector.deinflect(text.slice(0, i), term => {
                    return this.dictionary.findTerm(term).then(definitions => definitions.map(def => def.tags));
                }).then(inflects => {
                    for (const inflect of inflects) {
                        this.processTerm(groups, df.source, df.tags, df.rules, df.root);
                    }
                })
            );
        }

        return Promise.all(promises).then(Promise.resolve(groups));
    }

    findTerm(text) {
        return this.findTermGroups(text).then(groups => {
            let definitions = [];
            for (const key in groups) {
                definitions.push(groups[key]);
            }

            definitions = definitions.sort((v1, v2) => {
                const sl1 = v1.source.length;
                const sl2 = v2.source.length;
                if (sl1 > sl2) {
                    return -1;
                } else if (sl1 < sl2) {
                    return 1;
                }

                const s1 = v1.score;
                const s2 = v2.score;
                if (s1 > s2) {
                    return -1;
                } else if (s1 < s2) {
                    return 1;
                }

                const rl1 = v1.rules.length;
                const rl2 = v2.rules.length;
                if (rl1 < rl2) {
                    return -1;
                } else if (rl1 > rl2) {
                    return 1;
                }

                return v2.expression.localeCompare(v1.expression);
            });

            let length = 0;
            for (const result of definitions) {
                length = Math.max(length, result.source.length);
            }

            return {definitions, length};
        });
    }

    findKanji(text) {
        let definitions = [];
        const processed = {};

        for (const c of text) {
            if (!processed[c]) {
                definitions = definitions.concat(this.dictionary.findKanji(c));
                processed[c] = true;
            }
        }

        return this.processKanji(definitions);
    }

    processTerm(groups, source, tags, rules, root) {
        return this.dictionary.findTerm(root).then(definitions => {
            for (const definition of definitions) {
                if (definition.id in groups) {
                    continue;
                }

                let matched = tags.length === 0;
                for (const tag of tags) {
                    if (definition.tags.indexOf(tag) !== -1) {
                        matched = true;
                        break;
                    }
                }

                if (!matched) {
                    continue;
                }

                const tagItems = [];
                for (const tag of definition.tags) {
                    const tagItem = {
                        name: tag,
                        class: 'default',
                        order: Number.MAX_SAFE_INTEGER,
                        score: 0,
                        desc: definition.entities[tag] || '',
                    };

                    this.applyTagMeta(tagItem);
                    tagItems.push(tagItem);
                }

                let score = 0;
                for (const tagItem of tagItems) {
                    score += tagItem.score;
                }

                groups[definition.id] = {
                    score,
                    source,
                    rules,
                    expression: definition.expression,
                    reading: definition.reading,
                    glossary: definition.glossary,
                    tags: Translator.sortTags(tagItems)
                };
            }
        });
    }

    processKanji(entries) {
        const results = [];

        for (const entry of entries) {
            const tagItems = [];
            for (const tag of entry.tags) {
                const tagItem = {
                    name: tag,
                    class: 'default',
                    order: Number.MAX_SAFE_INTEGER,
                    desc: '',
                };

                this.applyTagMeta(tagItem);
                tagItems.push(tagItem);
            }

            results.push({
                character: entry.character,
                kunyomi: entry.kunyomi,
                onyomi: entry.onyomi,
                glossary: entry.glossary,
                tags: Translator.sortTags(tagItems)
            });
        }

        return results;
    }

    applyTagMeta(tag) {
        const symbol = tag.name.split(':')[0];
        for (const prop in this.tagMeta[symbol] || {}) {
            tag[prop] = this.tagMeta[symbol][prop];
        }
    }

    static sortTags(tags) {
        return tags.sort((v1, v2) => {
            const order1 = v1.order;
            const order2 = v2.order;
            if (order1 < order2) {
                return -1;
            } else if (order1 > order2) {
                return 1;
            }

            const name1 = v1.name;
            const name2 = v2.name;
            if (name1 < name2) {
                return -1;
            } else if (name1 > name2) {
                return 1;
            }

            return 0;
        });
    }
}
