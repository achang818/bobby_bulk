import { useEffect, useRef, useState } from 'react'
import { equipmentLabels, equipmentTags } from '../domain/equipment'
import type { Gym } from '../domain/models'

type Props = { gyms: Gym[]; selectedId: string; onSave: (gym: Gym) => void }

export function GymProfiles({ gyms, selectedId, onSave }: Props) {
    const [editing, setEditing] = useState<Gym | null>(null)
    const [message, setMessage] = useState('')
    const manage = useRef<HTMLElement>(null)
    function close() { setEditing(null); manage.current?.focus() }
    return <details className="gym-manager">
        <summary ref={manage}>Manage gyms</summary>
        <p className="brief-note">Choose broad equipment categories. Bodyweight exercises are always available unless marked unavailable today.</p>
        <div className="gym-profile-list">{gyms.map((gym) => <div key={gym.id}><span><strong>{gym.name}</strong>{gym.id === selectedId && <small>Selected for today</small>}</span><button type="button" className="text-button" onClick={() => { setMessage(''); setEditing(gym) }} aria-label={`Edit ${gym.name}`}>Edit</button></div>)}</div>
        {!editing && <button type="button" className="secondary-button full" onClick={() => { setMessage(''); setEditing({ id: crypto.randomUUID(), name: '', equipment: [] }) }}>Add gym</button>}
        {editing && <GymForm key={editing.id} gym={editing} gyms={gyms} onCancel={close} onSave={(gym) => { onSave(gym); setMessage(`${gym.name} saved and selected.`); close() }} />}
        <p className="brief-note" role="status">{message}</p>
    </details>
}

function GymForm({ gym, gyms, onCancel, onSave }: { gym: Gym; gyms: Gym[]; onCancel: () => void; onSave: (gym: Gym) => void }) {
    const [name, setName] = useState(gym.name)
    const [equipment, setEquipment] = useState(gym.equipment.filter((tag) => tag !== 'bodyweight'))
    const [error, setError] = useState('')
    const nameInput = useRef<HTMLInputElement>(null)
    useEffect(() => { nameInput.current?.focus() }, [])
    function submit() {
        if (!name.trim()) { setError('Give this gym a name.'); nameInput.current?.focus(); return }
        if (gyms.some((item) => item.id !== gym.id && item.name.toLowerCase() === name.trim().toLowerCase())) { setError('Choose a different name so your gyms are easy to tell apart.'); return }
        onSave({ id: gym.id, name: name.trim(), equipment })
    }
    return <form className="gym-form" onSubmit={(event) => { event.preventDefault(); submit() }}>
        <label>Gym name<input ref={nameInput} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="e.g. Home" /></label>
        <fieldset className="gym-equipment"><legend>Equipment here</legend>{equipmentTags.filter((tag) => tag !== 'bodyweight').map((tag) => <label key={tag}><input type="checkbox" checked={equipment.includes(tag)} onChange={() => setEquipment((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} />{equipmentLabels[tag]}</label>)}</fieldset>
        {error && <p className="gym-error" role="alert">{error}</p>}
        <div className="gym-form-actions"><button type="submit" className="primary-button">Save gym</button><button type="button" className="text-button" onClick={onCancel}>Cancel</button></div>
    </form>
}
