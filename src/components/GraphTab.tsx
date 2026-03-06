'use client';

import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faDiagramProject, faSearch, faLightbulb, faPlus, faTrash,
    faNetworkWired, faCode, faMicrochip, faPlug, faEthernet,
    faCircle, faArrowsLeftRight, faBolt, faShield, faWrench
} from '@fortawesome/free-solid-svg-icons';

type GraphStats = {
    total_relationships: number;
    unique_entities: number;
    relationship_types: string[];
};

type EntityType = 'error' | 'terminal' | 'device' | 'protocol' | 'component' | 'cause' | 'solution';

type RelatedEntity = {
    entity_b: string;
    relationship: string;
    confidence: number;
};

type Entity = {
    name: string;
    type: EntityType;
};

type Relationship = {
    entity_a: string;
    entity_b: string;
    relationship: string;
    confidence: number;
};

const ENTITY_TYPE_ICONS: Record<EntityType, any> = {
    error: faBolt,
    terminal: faPlug,
    device: faMicrochip,
    protocol: faEthernet,
    component: faWrench,
    cause: faShield,
    solution: faLightbulb,
};

const ENTITY_TYPE_COLORS: Record<EntityType, string> = {
    error: 'bg-red-100 text-red-700 border-red-200',
    terminal: 'bg-amber-100 text-amber-700 border-amber-200',
    device: 'bg-blue-100 text-blue-700 border-blue-200',
    protocol: 'bg-purple-100 text-purple-700 border-purple-200',
    component: 'bg-green-100 text-green-700 border-green-200',
    cause: 'bg-orange-100 text-orange-700 border-orange-200',
    solution: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export default function GraphTab() {
    const [stats, setStats] = useState<GraphStats | null>(null);
    const [activeTab, setActiveTab] = useState<'search' | 'manage' | 'insights'>('search');
    const [searchEntity, setSearchEntity] = useState('');
    const [related, setRelated] = useState<RelatedEntity[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Entity management state
    const [entities, setEntities] = useState<Entity[]>([]);
    const [relationships, setRelationships] = useState<Relationship[]>([]);
    const [newEntity, setNewEntity] = useState({ name: '', type: 'device' as EntityType });
    const [newRelation, setNewRelation] = useState({ entityA: '', entityB: '', relationship: 'related_to' });
    const [filterType, setFilterType] = useState<EntityType | 'all'>('all');

    useEffect(() => {
        fetchGraphStats();
        fetchAllEntities();
    }, []);

    const fetchGraphStats = async () => {
        try {
            const res = await fetch('/api/admin/graph');
            const data = await res.json();
            setStats(data);
        } catch (e) {
            console.error('Failed to fetch graph stats:', e);
        }
    };

    const fetchAllEntities = async () => {
        try {
            const res = await fetch('/api/admin/graph', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'get_all', data: {} })
            });
            const data = await res.json();
            if (data.entities) setEntities(data.entities);
            if (data.relationships) setRelationships(data.relationships);
        } catch (e) {
            console.error('Failed to fetch entities:', e);
        }
    };

    const handleSearch = async () => {
        if (!searchEntity.trim()) return;

        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/admin/graph', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'find_related',
                    data: { entity: searchEntity, maxResults: 15 }
                })
            });
            const data = await res.json();

            if (data.related) {
                setRelated(data.related);
            } else {
                setRelated([]);
            }
        } catch (e) {
            setError('Failed to search entities');
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleAddEntity = async () => {
        if (!newEntity.name.trim()) return;

        setLoading(true);
        try {
            const res = await fetch('/api/admin/graph', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'add_entities',
                    data: [newEntity]
                })
            });
            const data = await res.json();

            if (data.success) {
                setNewEntity({ name: '', type: 'device' });
                fetchGraphStats();
                fetchAllEntities();
            }
        } catch (e) {
            setError('Failed to add entity');
        } finally {
            setLoading(false);
        }
    };

    const handleAddRelationship = async () => {
        if (!newRelation.entityA || !newRelation.entityB) return;

        setLoading(true);
        try {
            const res = await fetch('/api/admin/graph', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'add_relationship',
                    data: newRelation
                })
            });
            const data = await res.json();

            if (data.success) {
                setNewRelation({ entityA: '', entityB: '', relationship: 'related_to' });
                fetchGraphStats();
                fetchAllEntities();
            }
        } catch (e) {
            setError('Failed to add relationship');
        } finally {
            setLoading(false);
        }
    };

    const handleExtractFromText = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/graph', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'extract_sample',
                    data: {}
                })
            });
            const data = await res.json();

            if (data.entities && data.entities.length > 0) {
                setEntities(prev => [...prev, ...data.entities]);
            }
        } catch (e) {
            console.error('Extract failed:', e);
        } finally {
            setLoading(false);
        }
    };

    const filteredEntities = filterType === 'all'
        ? entities
        : entities.filter(e => e.type === filterType);

    const typeBreakdown = entities.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div className="space-y-4 animate-fade-up">
            <div className="skeuo-card p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faDiagramProject} className="w-5 h-5 text-[#0D9488]" />
                        <h2 className="text-lg font-bold text-[#1C1917]">Knowledge Graph</h2>
                    </div>
                    <span className="text-xs px-2 py-1 bg-[#0D9488]/10 text-[#0D9488] rounded-full">
                        {stats?.unique_entities || 0} entities
                    </span>
                </div>

                {/* Stats Overview */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-[#FAF7F2] rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-[#0D9488]">{stats?.unique_entities || '-'}</p>
                        <p className="text-[10px] text-[#78716C] uppercase">Entities</p>
                    </div>
                    <div className="bg-[#FAF7F2] rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-[#0D9488]">{stats?.total_relationships || '-'}</p>
                        <p className="text-[10px] text-[#78716C] uppercase">Relations</p>
                    </div>
                    <div className="bg-[#FAF7F2] rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-[#0D9488]">{stats?.relationship_types?.length || '-'}</p>
                        <p className="text-[10px] text-[#78716C] uppercase">Types</p>
                    </div>
                    <div className="bg-[#FAF7F2] rounded-lg p-3 text-center">
                        <p className="text-lg font-bold text-emerald-600">🔮</p>
                        <p className="text-[10px] text-[#78716C] uppercase">Active</p>
                    </div>
                </div>

                {/* Sub-tabs */}
                <div className="flex gap-1 mb-4 p-1 bg-[#F0EBE3] rounded-lg">
                    {[
                        { key: 'search', label: 'Search', icon: faSearch },
                        { key: 'manage', label: 'Manage', icon: faNetworkWired },
                        { key: 'insights', label: 'Insights', icon: faLightbulb },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key as any)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-medium transition-all ${activeTab === tab.key
                                    ? 'bg-white text-[#1C1917] shadow-sm'
                                    : 'text-[#78716C] hover:text-[#44403C]'
                                }`}
                        >
                            <FontAwesomeIcon icon={tab.icon} className="w-3 h-3" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Search Tab */}
                {activeTab === 'search' && (
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={searchEntity}
                                onChange={(e) => setSearchEntity(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Search entity (e.g., E001, TB1+, RS485)"
                                className="flex-1 px-3 py-2 rounded-lg border border-[#D6CFC4] text-sm focus:outline-none focus:border-[#0D9488]"
                            />
                            <button
                                onClick={handleSearch}
                                disabled={loading}
                                className="px-4 py-2 bg-[#0D9488] text-white rounded-lg text-sm font-medium disabled:opacity-50"
                            >
                                <FontAwesomeIcon icon={faSearch} className="w-3 h-3" />
                            </button>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
                        )}

                        <div className="bg-[#FAF7F2] rounded-lg p-3 min-h-40">
                            {loading ? (
                                <div className="flex justify-center py-8">
                                    <div className="flex gap-1">
                                        <div className="w-2 h-2 bg-[#0D9488] rounded-full animate-bounce" />
                                        <div className="w-2 h-2 bg-[#0D9488] rounded-full animate-bounce" style={{ animationDelay: '100ms' }} />
                                        <div className="w-2 h-2 bg-[#0D9488] rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                                    </div>
                                </div>
                            ) : related.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="text-xs text-[#78716C] mb-3">
                                        Found {related.length} related entities
                                    </p>
                                    {related.map((r, i) => (
                                        <div key={i} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-[#D6CFC4]">
                                            <div className="flex items-center gap-3">
                                                <FontAwesomeIcon icon={faCircle} className="w-2 h-2 text-[#0D9488]" />
                                                <span className="font-medium text-[#1C1917]">{r.entity_b}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs px-2 py-0.5 rounded bg-[#0D9488]/10 text-[#0D9488]">
                                                    {r.relationship}
                                                </span>
                                                <span className="text-xs font-medium text-[#0D9488]">
                                                    {Math.round(r.confidence * 100)}%
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <FontAwesomeIcon icon={faNetworkWired} className="w-8 h-8 text-[#A8A29E] mb-2" />
                                    <p className="text-[#78716C] text-sm">
                                        {searchEntity ? 'No related entities found' : 'Enter an entity to find relationships'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Manage Tab */}
                {activeTab === 'manage' && (
                    <div className="space-y-4">
                        {/* Add Entity */}
                        <div className="p-4 bg-[#FAF7F2] rounded-lg border border-[#D6CFC4]">
                            <h4 className="text-sm font-semibold text-[#1C1917] mb-3 flex items-center gap-2">
                                <FontAwesomeIcon icon={faPlus} className="w-3 h-3 text-[#0D9488]" />
                                Add New Entity
                            </h4>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newEntity.name}
                                    onChange={(e) => setNewEntity({ ...newEntity, name: e.target.value })}
                                    placeholder="Entity name (e.g., E015, COM1)"
                                    className="flex-1 px-3 py-2 rounded-lg border border-[#D6CFC4] text-sm"
                                />
                                <select
                                    value={newEntity.type}
                                    onChange={(e) => setNewEntity({ ...newEntity, type: e.target.value as EntityType })}
                                    className="px-3 py-2 rounded-lg border border-[#D6CFC4] text-sm"
                                >
                                    <option value="error">Error</option>
                                    <option value="terminal">Terminal</option>
                                    <option value="device">Device</option>
                                    <option value="protocol">Protocol</option>
                                    <option value="component">Component</option>
                                    <option value="cause">Cause</option>
                                    <option value="solution">Solution</option>
                                </select>
                                <button
                                    onClick={handleAddEntity}
                                    disabled={loading || !newEntity.name}
                                    className="px-4 py-2 bg-[#0D9488] text-white rounded-lg text-sm font-medium disabled:opacity-50"
                                >
                                    Add
                                </button>
                            </div>
                        </div>

                        {/* Add Relationship */}
                        <div className="p-4 bg-[#FAF7F2] rounded-lg border border-[#D6CFC4]">
                            <h4 className="text-sm font-semibold text-[#1C1917] mb-3 flex items-center gap-2">
                                <FontAwesomeIcon icon={faArrowsLeftRight} className="w-3 h-3 text-[#0D9488]" />
                                Add Relationship
                            </h4>
                            <div className="flex gap-2 items-center">
                                <input
                                    type="text"
                                    value={newRelation.entityA}
                                    onChange={(e) => setNewRelation({ ...newRelation, entityA: e.target.value })}
                                    placeholder="Entity A"
                                    className="flex-1 px-3 py-2 rounded-lg border border-[#D6CFC4] text-sm"
                                />
                                <select
                                    value={newRelation.relationship}
                                    onChange={(e) => setNewRelation({ ...newRelation, relationship: e.target.value })}
                                    className="px-3 py-2 rounded-lg border border-[#D6CFC4] text-sm"
                                >
                                    <option value="related_to">Related to</option>
                                    <option value="part_of">Part of</option>
                                    <option value="connected_to">Connected to</option>
                                    <option value="caused_by">Caused by</option>
                                    <option value="resolved_by">Resolved by</option>
                                    <option value="compatible_with">Compatible with</option>
                                </select>
                                <input
                                    type="text"
                                    value={newRelation.entityB}
                                    onChange={(e) => setNewRelation({ ...newRelation, entityB: e.target.value })}
                                    placeholder="Entity B"
                                    className="flex-1 px-3 py-2 rounded-lg border border-[#D6CFC4] text-sm"
                                />
                                <button
                                    onClick={handleAddRelationship}
                                    disabled={loading || !newRelation.entityA || !newRelation.entityB}
                                    className="px-4 py-2 bg-[#0D9488] text-white rounded-lg text-sm font-medium disabled:opacity-50"
                                >
                                    Link
                                </button>
                            </div>
                        </div>

                        {/* Entity List with Filters */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-semibold text-[#1C1917]">All Entities</h4>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => setFilterType('all')}
                                        className={`px-2 py-1 text-xs rounded ${filterType === 'all' ? 'bg-[#0D9488] text-white' : 'bg-[#F0EBE3] text-[#78716C]'}`}
                                    >
                                        All
                                    </button>
                                    {Object.keys(ENTITY_TYPE_COLORS).map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setFilterType(type as EntityType)}
                                            className={`px-2 py-1 text-xs rounded capitalize ${filterType === type ? 'bg-[#0D9488] text-white' : 'bg-[#F0EBE3] text-[#78716C]'}`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="max-h-64 overflow-y-auto space-y-2">
                                {filteredEntities.length > 0 ? (
                                    filteredEntities.map((entity, i) => (
                                        <div key={i} className="flex items-center justify-between p-2 px-3 bg-white rounded-lg border border-[#D6CFC4]">
                                            <div className="flex items-center gap-2">
                                                <FontAwesomeIcon
                                                    icon={ENTITY_TYPE_ICONS[entity.type]}
                                                    className={`w-3 h-3 ${entity.type === 'error' ? 'text-red-500' :
                                                            entity.type === 'terminal' ? 'text-amber-500' :
                                                                entity.type === 'device' ? 'text-blue-500' :
                                                                    entity.type === 'protocol' ? 'text-purple-500' :
                                                                        'text-green-500'
                                                        }`}
                                                />
                                                <span className="text-sm font-medium text-[#1C1917]">{entity.name}</span>
                                            </div>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${ENTITY_TYPE_COLORS[entity.type]}`}>
                                                {entity.type}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-center py-4 text-[#78716C] text-sm">No entities found</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Insights Tab */}
                {activeTab === 'insights' && (
                    <div className="space-y-4">
                        {/* Type Breakdown */}
                        <div className="p-4 bg-[#FAF7F2] rounded-lg">
                            <h4 className="text-sm font-semibold text-[#1C1917] mb-3">Entity Type Distribution</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {Object.entries(typeBreakdown).map(([type, count]) => (
                                    <div key={type} className={`p-3 rounded-lg border ${ENTITY_TYPE_COLORS[type as EntityType]}`}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <FontAwesomeIcon icon={ENTITY_TYPE_ICONS[type as EntityType]} className="w-4 h-4" />
                                            <span className="text-xs font-medium capitalize">{type}</span>
                                        </div>
                                        <p className="text-xl font-bold">{count}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Relationship Types */}
                        <div className="p-4 bg-[#FAF7F2] rounded-lg">
                            <h4 className="text-sm font-semibold text-[#1C1917] mb-3">Relationship Types</h4>
                            <div className="space-y-2">
                                {[
                                    { type: 'part_of', desc: 'Device → Component' },
                                    { type: 'connected_to', desc: 'Terminal ↔ Terminal' },
                                    { type: 'caused_by', desc: 'Error ← Cause' },
                                    { type: 'resolved_by', desc: 'Error ← Solution' },
                                    { type: 'compatible_with', desc: 'Protocol ↔ Protocol' },
                                    { type: 'related_to', desc: 'General relationship' },
                                ].map(rel => (
                                    <div key={rel.type} className="flex items-center justify-between p-2 bg-white rounded-lg border border-[#D6CFC4]">
                                        <span className="text-sm font-medium text-[#1C1917]">{rel.type.replace('_', ' ')}</span>
                                        <span className="text-xs text-[#78716C]">{rel.desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Auto Extract */}
                        <button
                            onClick={handleExtractFromText}
                            disabled={loading}
                            className="w-full p-4 bg-gradient-to-r from-[#0D9488] to-[#0F766E] text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                        >
                            <FontAwesomeIcon icon={faWrench} className="w-4 h-4" />
                            {loading ? 'Extracting...' : 'Auto-Extract Entities from Samples'}
                        </button>
                    </div>
                )}

                {/* Info */}
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-start gap-2">
                        <FontAwesomeIcon icon={faLightbulb} className="w-4 h-4 text-blue-600 mt-0.5" />
                        <p className="text-xs text-blue-800">
                            <strong>💡 Tip:</strong> Entities like error codes (E001), terminals (TB1+),
                            and protocols (RS485) are automatically extracted during PDF ingestion.
                            The knowledge graph boosts retrieval for related entities.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
