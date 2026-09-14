import { openModal } from './modal.js';
// contactsView.js — Per-project contacts list.
// - All contacts (internal or client) must be explicitly linked to a project.
// - When adding an internal contact, an option lets you link them to all your projects at once.
// - Removing a contact only unlinks from THIS project; the person record and other projects untouched.

export function renderContacts({
  mount, people, project_contacts, projectId, project, projects,
  db, onRerender,
}) {

  // Only people linked to THIS project via project_contacts show up.
  const linkedIds = new Set(
    project_contacts.filter(pc => pc.project_id === projectId).map(pc => pc.person_id)
  );
  const projectPeople = people.filter(p => linkedIds.has(p.id));

  // Split by type for two sections
  const internalPeople = projectPeople.filter(p => !p.is_client);
  const clientPeople   = projectPeople.filter(p =>  p.is_client);

  const av = (p, sz = 36) =>
    `<div class="av" style="width:${sz}px;height:${sz}px;border-radius:50%;background:${p.color};
      display:inline-flex;align-items:center;justify-content:center;font-size:${Math.round(sz*.36)}px;
      font-weight:500;color:#fff">${p.initials}</div>`;

  const cardHTML = (p, kind) => `
    <div class="contact-card" data-person="${p.id}">
      ${av(p)}
      <div style="flex:1;min-width:0">
        <div class="contact-name">${p.name}</div>
        ${p.org ? `<div class="contact-org">${p.org}</div>` : ''}
        <span class="contact-role-badge ${kind === 'internal' ? 'contact-badge-int' : 'contact-badge-cli'}">
          <i class="ti ti-${kind === 'internal' ? 'building' : 'briefcase'}" style="font-size:10px"></i>
          ${kind === 'internal' ? 'Internal · Solusign' : 'Client'}
        </span>
      </div>
      <button class="contact-remove" data-person="${p.id}" title="Remove from this project"><i class="ti ti-x"></i></button>
    </div>`;

  // "Available to link" section: people that exist elsewhere but aren't on this project yet.
  // Lets user quickly attach someone who already exists (avoids duplicate people).
  const unlinkedPeople = people.filter(p => !linkedIds.has(p.id));

  mount.innerHTML = `
    <div class="contacts-wrap">
      <div class="contacts-max">
        <div class="contacts-head">
          <div>
            <div class="contacts-title">Contacts</div>
            <div class="contacts-sub">${project?.name || 'This project'}</div>
          </div>
          <button class="btn" id="addContactBtn" style="height:36px;padding:0 18px;font-size:13px">
            <i class="ti ti-plus" style="font-size:12px"></i>Add contact
          </button>
        </div>

        <div class="contacts-section">
          <div class="contacts-section-title">
            <i class="ti ti-building" style="font-size:12px;color:#534AB7"></i>
            Internal · Solusign
            <span class="contacts-section-count">${internalPeople.length}</span>
          </div>
          ${internalPeople.length
            ? `<div class="contacts-grid">${internalPeople.map(p => cardHTML(p, 'internal')).join('')}</div>`
            : `<div class="contact-empty">No internal contacts on this project yet.</div>`}
        </div>

        <div class="contacts-section">
          <div class="contacts-section-title">
            <i class="ti ti-briefcase" style="font-size:12px;color:#BA7517"></i>
            Client · ${project?.client_org || 'This project'}
            <span class="contacts-section-count">${clientPeople.length}</span>
          </div>
          ${clientPeople.length
            ? `<div class="contacts-grid">${clientPeople.map(p => cardHTML(p, 'client')).join('')}</div>`
            : `<div class="contact-empty">No client contacts yet.</div>`}
        </div>

        ${unlinkedPeople.length ? `
          <div class="contacts-section">
            <div class="contacts-section-title">
              <i class="ti ti-link" style="font-size:12px;color:#9CA3AF"></i>
              Available to link from other projects
              <span class="contacts-section-count">${unlinkedPeople.length}</span>
            </div>
            <div class="contacts-grid">
              ${unlinkedPeople.map(p => `
                <div class="contact-card contact-card-avail" data-person="${p.id}">
                  ${av(p, 32)}
                  <div style="flex:1;min-width:0">
                    <div class="contact-name" style="font-size:13px">${p.name}</div>
                    ${p.org ? `<div class="contact-org">${p.org}</div>` : ''}
                    <span class="contact-role-badge ${p.is_client ? 'contact-badge-cli' : 'contact-badge-int'}">
                      ${p.is_client ? 'Client' : 'Internal'}
                    </span>
                  </div>
                  <button class="contact-link-existing" data-person="${p.id}"
                          style="background:transparent;border:.5px solid #534AB7;color:#534AB7;font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer;font-weight:500;align-self:center">
                    <i class="ti ti-plus" style="font-size:10px"></i> Link
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>`;

  // ── Add contact via modal ──
  mount.querySelector('#addContactBtn')?.addEventListener('click', () => {
    openModal({
      title: 'Add contact',
      fields: [
        {
          key: 'name',
          label: 'Full name',
          type: 'text',
          required: true,
          placeholder: 'e.g. Alice Smith',
        },
        {
          key: 'kind',
          label: 'Type',
          type: 'select',
          value: 'client',
          options: [
            { value: 'client',   label: `Client · ${project?.client_org || 'this project only'}` },
            { value: 'internal', label: 'Internal · Solusign' },
          ],
        },
        {
          key: 'org',
          label: 'Organisation',
          type: 'text',
          placeholder: `Default: ${project?.client_org || 'Client'} for client, Solusign for internal`,
          hint: 'Leave blank to use the default for the type above.',
        },
        {
          key: 'email',
          label: 'Email',
          type: 'text',
          placeholder: 'Optional',
        },
        {
          key: 'link_to_all',
          label: 'Link to',
          type: 'select',
          value: 'this',
          options: [
            { value: 'this', label: 'This project only' },
            { value: 'all',  label: `All ${projects?.length || 0} of my projects` },
          ],
          hint: 'Useful for internal team members who work across multiple projects.',
        },
      ],
      submitLabel: 'Add contact',
      onSubmit: data => {
        const name = (data.name || '').trim();
        if (!name) return;
        const isInternal = data.kind === 'internal';
        const org = (data.org && data.org.trim())
          ? data.org.trim()
          : (isInternal ? 'Solusign' : (project?.client_org || null));

        const initials = name.split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?';
        const palette = ['#5B7FCC', '#5B9E7F', '#9B67C2', '#C47B3E', '#D4716A', '#7F77DD', '#1D9E75', '#BA7517'];
        const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
        const color = palette[hash % palette.length];

        const newPerson = db.insert('people', {
          name, initials, color, is_client: !isInternal, org,
          email: (data.email || '').trim() || null,
        });

        // Link to project(s)
        if (data.link_to_all === 'all' && projects?.length) {
          projects.forEach(pj => {
            db.insert('project_contacts', {
              project_id: pj.id,
              person_id: newPerson.id,
            });
          });
        } else {
          db.insert('project_contacts', {
            project_id: projectId,
            person_id: newPerson.id,
          });
        }

        onRerender?.();
      },
    });
  });

  // ── Link an existing person (from another project) to this one ──
  mount.querySelectorAll('.contact-link-existing').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const personId = btn.dataset.person;
      // Avoid double-link (belt & braces)
      const exists = project_contacts.some(pc => pc.project_id === projectId && pc.person_id === personId);
      if (!exists) {
        db.insert('project_contacts', { project_id: projectId, person_id: personId });
      }
      onRerender?.();
    });
  });

  // ── Remove (unlink) contact from this project — person + other projects untouched ──
  mount.querySelectorAll('.contact-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const personId = btn.dataset.person;
      const link = project_contacts.find(pc => pc.project_id === projectId && pc.person_id === personId);
      if (link && confirm('Remove this contact from the project? They remain on any other projects you have linked them to.')) {
        db.remove('project_contacts', link.id);
        onRerender?.();
      }
    });
  });
}
